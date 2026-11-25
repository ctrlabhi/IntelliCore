
import { describe, expect, it } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import { assignmentPresentation } from '../../backend/src/modules/work/taskService.js';
import { evaluateScore } from '../../backend/src/modules/work/submissionService.js';
import { validateAttachment } from '../../backend/src/modules/work/attachmentService.js';
import { iso, safeUrl, recipients, dateRange, performanceQuery } from '../../backend/src/modules/work/workInput.js';
import { recoveredTemplates, recoveredTracks } from '../../backend/src/modules/learning/curriculumCatalog.js';

describe('Phase 06 validation and calculations', () => {
  it('keeps the 16 recovered exercises and 100-point rubrics mapped to eight department codes', () => {
    expect(recoveredTracks).toHaveLength(8);
    expect(recoveredTemplates.WORDPRESS_DEV).toBeUndefined();
    const templates = Object.values(recoveredTemplates).flat();
    expect(new Set(templates.map((item) => item.templateKey)).size).toBe(16);
    for (const item of templates) expect(item.rubric.reduce((sum, row) => sum + row.points, 0)).toBe(100);
  });

  it('validates dates, offsets, duplicate recipient selections and IST reporting boundaries', () => {
    expect(iso.parse('2034-02-06T09:30:00+05:30').toISOString()).toBe('2034-02-06T04:00:00.000Z');
    for (const value of ['2034-02-31T09:30:00Z', '2034-02-06T09:30:00', '2034-02-06T09:30:00+29:30']) {
      expect(iso.safeParse(value).success).toBe(false);
    }
    const internshipId = '1dfb4388-53db-4d62-8504-a408c5ec3663';
    expect(recipients.safeParse({ recipients: [{ internshipId }, { internshipId }] }).success).toBe(false);
    expect(dateRange(performanceQuery.parse({ from: '2034-02-06', to: '2034-02-06' }))).toEqual({
      gte: new Date('2034-02-05T18:30:00Z'), lt: new Date('2034-02-06T18:30:00Z')
    });
    expect(() => dateRange(performanceQuery.parse({ from: '2034-02-07', to: '2034-02-06' }))).toThrow();
  });

  it('accepts project links without allowing active URL schemes or embedded credentials', () => {
    expect(safeUrl.parse('https://github.com/example/project')).toContain('github.com');
    for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'https://alice:pass@example.test', 'https://example.test\\path']) {
      expect(safeUrl.safeParse(value).success).toBe(false);
    }
  });

  it('keeps derived overdue status independent from submitted assignment state', () => {
    const now = new Date('2034-02-06T04:01:00Z');
    const row = { status: 'IN_PROGRESS', task: { status: 'PUBLISHED', availableFrom: new Date('2034-02-06T03:00:00Z'),
      dueAt: new Date('2034-02-06T04:00:00Z') } };
    expect(assignmentPresentation(row, now)).toMatchObject({ status: 'IN_PROGRESS', overdue: true, dueToday: true, serverTime: now });
    expect(assignmentPresentation({ ...row, status: 'SUBMITTED' }, now).overdue).toBe(false);
    expect(assignmentPresentation({ ...row, task: { ...row.task, status: 'CLOSED' } }, now).overdue).toBe(false);
  });

  it('bounds each score to its immutable rubric or maximum', () => {
    const snapshot = { maximumScore: 10, rubric: [{ points: 6 }, { points: 4 }] };
    expect(evaluateScore(snapshot, { criterionScores: [6, 2] })).toEqual({ maximumScore: 10, score: 8, criterionScores: [6, 2] });
    expect(() => evaluateScore(snapshot, { criterionScores: [7, 2] })).toThrow();
    expect(() => evaluateScore(snapshot, { criterionScores: [1] })).toThrow();
    expect(() => evaluateScore(snapshot, { criterionScores: [6, 2], score: 9 })).toThrow();
    expect(() => evaluateScore({ maximumScore: null, rubric: [] }, { score: 1 })).toThrow();
    expect(evaluateScore({ maximumScore: 10, rubric: [] }, { score: 0 }).score).toBe(0);
  });

  it('checks actual file bytes and rejects traversal, active content, and appended image data', () => {
    const chunk = (type, contents = Buffer.alloc(0)) => {
      const body = Buffer.concat([Buffer.from(type), contents]);
      const header = Buffer.alloc(4);
      const checksum = Buffer.alloc(4);
      header.writeUInt32BE(contents.length);
      checksum.writeUInt32BE(crc32(body));
      return Buffer.concat([header, body, checksum]);
    };
    const header = Buffer.from('00000001000000010800000000', 'hex');
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([0, 128]))), chunk('IEND')]);
    const text = Buffer.from('Practice exercise submission.');
    expect(validateAttachment(text, 'report.txt')).toMatchObject({ mimeType: 'text/plain', fileSize: text.length });
    expect(validateAttachment(png, 'image.png')).toMatchObject({ mimeType: 'image/png', fileSize: png.length });
    expect(() => validateAttachment(text, '..%2Freport.txt')).toThrow();
    expect(() => validateAttachment(text, 'report.png')).toThrow();
    expect(() => validateAttachment(Buffer.from('<iframe>example'), 'report.txt')).toThrow();
    expect(() => validateAttachment(Buffer.concat([png, text]), 'report.png')).toThrow();
  });
});
