import { randomUUID } from 'crypto';

export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = incomingId && typeof incomingId === 'string' ? incomingId : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export default requestIdMiddleware;

