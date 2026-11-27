
import { createHash, randomUUID } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import prisma from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';
import { transaction, lockUser } from '../../utils/phase04.js';
import storage from '../../integrations/storage/storageService.js';
import { attachmentSummary, lockedTask, ownAssignmentWhere, privateAssignmentWhere } from './taskService.js';
import { lockOwnDraft } from './submissionService.js';
import { audit, can, conflict, found, isIntern, own, scope } from './workAccess.js';

const platformLimitMb = process.env.VERCEL === '1' ? 4 : Infinity;
export const attachmentLimitBytes = Math.min(env.TASK_MAX_FILE_SIZE_MB, env.MAX_UPLOAD_SIZE_MB, platformLimitMb) * 1024 * 1024;
const unsupported = () => new AppError('Upload a valid plain-text document or non-interlaced PNG image.', 415, 'UNSAFE_FILE_TYPE');
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

function validatePng(bytes) {
  let position = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let depth = 0;
  let color = 0;
  let palette = false;
  const data = [];
  const permitted = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'pHYs', 'cHRM']);
  while (position + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(position);
    const end = position + 12 + size;
    if (end > bytes.length) throw unsupported();
    const type = bytes.toString('latin1', position + 4, position + 8);
    const value = bytes.subarray(position + 8, end - 4);
    if (!permitted.has(type) || crc32(bytes.subarray(position + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw unsupported();
    if (type === 'IHDR') {
      if (position !== 8 || size !== 13) throw unsupported();
      width = value.readUInt32BE(0);
      height = value.readUInt32BE(4);
      depth = value[8];
      color = value[9];
      const validDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
      if (!width || !height || width * height > 16000000 || !validDepths[color]?.includes(depth)
          || value[10] || value[11] || value[12]) throw unsupported();
    } else if (!width) throw unsupported();
    if (type === 'PLTE') {
      if (palette || data.length || !size || size > 768 || size % 3) throw unsupported();
      palette = true;
    }
    if (type === 'IDAT') data.push(value);
    if (type === 'IEND') {
      if (size || end !== bytes.length || !data.length || (color === 3 && !palette)) throw unsupported();
      const rowSize = 1 + Math.ceil(width * channels * depth / 8);
      const expected = rowSize * height;
      if (expected > 32 * 1024 * 1024) throw unsupported();
      let pixels;
      try {
        const compressed = Buffer.concat(data);
        const decoded = inflateSync(compressed, { maxOutputLength: expected, info: true });
        if (decoded.engine.bytesWritten !== compressed.length) throw unsupported();
        pixels = decoded.buffer;
      } catch {
        throw unsupported();
      }
      if (pixels.length !== expected) throw unsupported();
      for (let i = 0; i < pixels.length; i += rowSize) if (pixels[i] > 4) throw unsupported();
      return;
    }
    position = end;
  }
  throw unsupported();
}

export function validateAttachment(bytes, encodedName) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw unsupported();
  if (bytes.length > attachmentLimitBytes) throw new AppError('The attachment exceeds the configured limit.', 413, 'FILE_TOO_LARGE');
  let originalFilename;
  try {
    originalFilename = decodeURIComponent(encodedName ?? '').normalize('NFC');
  } catch {
    throw new AppError('Provide a valid attachment name.', 400, 'INVALID_FILENAME');
  }
  if (!/^[\p{L}\p{N}_-][\p{L}\p{N} ._()-]{0,153}\.(txt|png)$/iu.test(originalFilename)) {
    throw new AppError('Use a simple attachment name ending in .txt or .png.', 400, 'INVALID_FILENAME');
  }
  let mimeType;
  if (/\.png$/i.test(originalFilename)) {
    if (!bytes.subarray(0, 8).equals(pngHeader)) throw unsupported();
    validatePng(bytes);
    mimeType = 'image/png';
  } else {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw unsupported();
    }
    if (!text.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)
        || /^\s*(?:#!|%PDF-|MZ|<!doctype|<\?xml|<html\b|<svg\b|<script\b|<iframe\b)/iu.test(text)
        || /<\s*(?:script|iframe|object|embed|svg|html)\b/iu.test(text)) throw unsupported();
    mimeType = 'text/plain';
  }
  return { originalFilename, mimeType, fileSize: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') };
}

export async function attachFile(req, targetId, purpose, expectedRevision, requestId) {
  const forTask = purpose === 'TASK_RESOURCE';
  if (forTask) scope(req, 'tasks:manage');
  else own(req, 'tasks');
  const bytes = req.body;
  const metadata = validateAttachment(bytes, req.get('x-attachment-name'));
  const storageKey = randomUUID();
  let stored = false;
  try {
    const item = await transaction(async (tx) => {
      if (forTask) {
        const task = await lockedTask(tx, req, targetId, 'tasks:manage');
        if (task.status !== 'DRAFT' || task.revision !== expectedRevision) throw conflict('Reload the task draft before attaching a file.');
        await lockUser(tx, req.user.id);
      } else {
        await lockOwnDraft(tx, req, targetId, expectedRevision);
      }
      const parent = forTask ? { taskId: targetId } : { submissionId: targetId };
      if (await tx.fileAttachment.count({ where: parent }) >= env.TASK_MAX_ATTACHMENTS) {
        throw conflict('This record has reached its attachment limit.', 'ATTACHMENT_LIMIT');
      }
      // Enforce cumulative user storage quota (20MB default)
      const userQuotaLimit = (env.MAX_USER_STORAGE_MB || 20) * 1024 * 1024;
      const userStorage = await tx.fileAttachment.aggregate({
        _sum: { fileSize: true },
        where: { ownerUserId: req.user.id }
      });
      const currentUsage = userStorage._sum.fileSize || 0;
      if (currentUsage + metadata.fileSize > userQuotaLimit) {
        throw new AppError('Storage quota exceeded for your account (20MB limit).', 413, 'STORAGE_QUOTA_EXCEEDED');
      }
      if (!stored) {
        await storage.savePrivate(storageKey, bytes);
        stored = true;
      }
      const file = await tx.fileAttachment.create({ data: { ...parent, ...metadata,
        attachmentPurpose: purpose, storageKey, ownerUserId: req.user.id }, select: attachmentSummary });
      const updated = forTask
        ? await tx.task.update({ where: { id: targetId }, data: { revision: { increment: 1 } }, select: { revision: true } })
        : await tx.taskSubmission.update({ where: { id: targetId }, data: { revision: { increment: 1 } }, select: { revision: true } });
      await audit(tx, req, requestId, 'TASK_ATTACHMENT_ADDED', 'FILE_ATTACHMENT', file.id, { targetId, purpose, fileSize: metadata.fileSize });
      return { ...file, revision: updated.revision };
    });
    return item;
  } catch (error) {
    if (stored) {
      try {
        const persisted = await prisma.fileAttachment.findUnique({ where: { storageKey }, select: { id: true } });
        if (!persisted) await storage.removePrivate(storageKey);
      } catch {
        logger.warn({ action: 'ATTACHMENT_RECONCILIATION_REQUIRED' }, 'A private attachment needs storage reconciliation.');
      }
    }
    throw error;
  }
}

function availableAttachmentScope(req) {
  if (isIntern(req)) {
    const now = new Date();
    const intern = ownAssignmentWhere(own(req, 'tasks'), now);
    return { OR: [
      { attachmentPurpose: 'TASK_RESOURCE', task: { availableFrom: { lte: now }, assignments: { some: intern } } },
      { attachmentPurpose: 'SUBMISSION', submission: { assignment: intern } }
    ] };
  }
  const scopes = [];
  if (can(req, 'tasks:manage')) scopes.push({ attachmentPurpose: 'TASK_RESOURCE', task: scope(req, 'tasks:manage') });
  if (can(req, 'tasks:review')) {
    scopes.push({ attachmentPurpose: 'TASK_RESOURCE', task: { ...scope(req, 'tasks:review'), publishedAt: { not: null } } });
    scopes.push({ attachmentPurpose: 'SUBMISSION', submission: { status: 'SUBMITTED', assignment: privateAssignmentWhere(req) } });
  }
  if (!scopes.length) scope(req, 'tasks:review');
  return { OR: scopes };
}

export async function downloadAttachment(req, res, id) {
  const item = found(await prisma.fileAttachment.findFirst({ where: { id, ...availableAttachmentScope(req) } }), 'Attachment');
  const stream = await storage.openPrivate(item.storageKey);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.attachment(item.originalFilename).type(item.mimeType).setHeader('Content-Length', item.fileSize);
  await pipeline(stream, res);
}

export async function removeAttachment(req, id, expectedRevision, requestId) {
  const result = await transaction(async (tx) => {
    const item = found(await tx.fileAttachment.findUnique({
      where: { id },
      select: { id: true, attachmentPurpose: true, taskId: true, submissionId: true, ownerUserId: true, storageKey: true, fileSize: true }
    }), 'Attachment');

    let updated;
    if (item.attachmentPurpose === 'TASK_RESOURCE' && item.taskId) {
      scope(req, 'tasks:manage');
      const task = await lockedTask(tx, req, item.taskId, 'tasks:manage');
      await lockUser(tx, item.ownerUserId);
      if (task.status !== 'DRAFT' || task.revision !== expectedRevision) {
        throw conflict('Reload the task draft before deleting this attachment.');
      }
      await tx.fileAttachment.delete({ where: { id: item.id } });
      updated = await tx.task.update({
        where: { id: task.id },
        data: { revision: { increment: 1 } },
        select: { revision: true }
      });
    } else if (item.attachmentPurpose === 'SUBMISSION' && item.submissionId) {
      own(req, 'tasks');
      await lockOwnDraft(tx, req, item.submissionId, expectedRevision);
      await lockUser(tx, item.ownerUserId);
      await tx.fileAttachment.delete({ where: { id: item.id } });
      updated = await tx.taskSubmission.update({
        where: { id: item.submissionId },
        data: { revision: { increment: 1 } },
        select: { revision: true }
      });
    } else {
      throw found(null, 'Attachment');
    }

    await audit(tx, req, requestId, 'TASK_ATTACHMENT_REMOVED', 'FILE_ATTACHMENT', item.id, {
      targetId: item.taskId ?? item.submissionId,
      purpose: item.attachmentPurpose,
      fileSize: item.fileSize
    });

    return { deletedId: item.id, revision: updated.revision, storageKey: item.storageKey };
  });

  try {
    await storage.removePrivate(result.storageKey);
  } catch (err) {
    logger.warn({ action: 'ATTACHMENT_REMOVAL_STORAGE_CLEANUP_FAILED', attachmentId: result.deletedId, err: err.message }, 'Attachment metadata deleted, physical storage cleanup deferred.');
  }

  return { deletedId: result.deletedId, revision: result.revision };
}
