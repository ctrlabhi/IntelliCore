import path from 'path';
import { fileURLToPath } from 'url';
import { sendError } from '../utils/response.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');
const notFoundHtmlPath = path.join(projectRoot, 'frontend/pages/404.html');

/**
 * 404 Handler
 * - If request path starts with /api/, returns standard JSON error envelope.
 * - Otherwise, serves the styled IntelliCore 404.html error page.
 */
export function notFoundHandler(req, res) {
  if (req.originalUrl.startsWith('/api/') || req.accepts('json') && !req.accepts('html')) {
    return sendError(
      res,
      `Endpoint ${req.method} ${req.originalUrl} does not exist on this server.`,
      404,
      'ROUTE_NOT_FOUND'
    );
  }

  res.status(404).sendFile(notFoundHtmlPath, (err) => {
    if (err) {
      res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested page was not found.</p><a href="/">Return Home</a></body></html>');
    }
  });
}

export default notFoundHandler;

