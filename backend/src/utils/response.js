/**
 * Standard API Response Envelope Helpers
 */

export function sendSuccess(res, data = {}, message = undefined, status = 200) {
  const payload = {
    success: true,
    data,
    requestId: res.locals?.requestId || (typeof res.getHeader === 'function' ? res.getHeader('x-request-id') : null) || null,
    timestamp: new Date().toISOString()
  };

  if (message !== undefined) {
    payload.message = message;
  }

  return res.status(status).json(payload);
}

export function sendError(res, errorOrMessage, status = 500, code = 'INTERNAL_ERROR', details = null) {
  let message = 'An unexpected error occurred.';
  let errCode = code;
  let errDetails = details;

  if (typeof errorOrMessage === 'string') {
    message = errorOrMessage;
  } else if (errorOrMessage && typeof errorOrMessage === 'object') {
    message = errorOrMessage.message || message;
    errCode = errorOrMessage.code || errCode;
    errDetails = errorOrMessage.details || errDetails;
  }

  const payload = {
    success: false,
    error: {
      code: errCode,
      message,
      ...(errDetails ? { details: errDetails } : {})
    },
    requestId: res.locals?.requestId || (typeof res.getHeader === 'function' ? res.getHeader('x-request-id') : null) || null,
    timestamp: new Date().toISOString()
  };

  return res.status(status).json(payload);
}

