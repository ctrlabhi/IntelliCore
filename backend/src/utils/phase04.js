import { z } from 'zod';
import { AppError } from './errors.js';
import { sendSuccess } from './response.js';
import { getPrismaClient } from '../config/database.js';

export const uuid = z.string().uuid();
export const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= '1000-01-01' && value <= '9998-12-31';
}, 'Enter a valid calendar date.').transform((value) => new Date(value));

const indiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function businessToday(now = new Date()) {
  return new Date(`${indiaDate.format(now)}T00:00:00.000Z`);
}

export function addCalendarMonths(start, months) {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day));
}

export const pageFields = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default('')
};

export function endpoint(handler, status = 200) {
  return async (req, res) => sendSuccess(res, await handler(req, res.locals.requestId), undefined, status);
}

export async function readPage(model, { where, select, orderBy }, { page, limit }) {
  const [total, items] = await Promise.all([
    model.count({ where }),
    model.findMany({ where, select, orderBy, skip: (page - 1) * limit, take: limit })
  ]);
  return { items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function transaction(work, { retryUnique = false, maxWait = 15000, timeout = 30000 } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getPrismaClient().$transaction(work, { isolationLevel: 'ReadCommitted', maxWait, timeout });
    } catch (error) {
      const contention = error.code === 'P2034'
        || (error.code === 'P2010' && ['1205', '1213'].includes(String(error.meta?.code)));
      if (contention || (retryUnique && error.code === 'P2002')) {
        if (attempt < 3) continue;
        throw new AppError('A concurrent update prevented this change. Try again.', 409, 'CONCURRENT_UPDATE');
      }
      if (error.code === 'P2002') {
        throw new AppError('A record with these values already exists.', 409, 'DUPLICATE_RECORD');
      }
      throw error;
    }
  }
}

export async function lockUser(tx, userId) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

export async function lockDepartment(tx, departmentId) {
  await tx.$queryRaw`SELECT id FROM departments WHERE id = ${departmentId} FOR UPDATE`;
}

export async function requireActiveDepartment(tx, departmentId) {
  const department = await tx.department.findUnique({ where: { id: departmentId } });
  if (!department?.isActive) {
    throw new AppError('Select an active department.', 409, 'DEPARTMENT_UNAVAILABLE');
  }
  return department;
}
