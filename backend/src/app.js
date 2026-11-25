import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

import env from './config/env.js';
import requestIdMiddleware from './middleware/requestId.js';
import requestLogger from './middleware/requestLogger.js';
import securityMiddleware from './middleware/security.js';
import errorHandler from './middleware/errorHandler.js';
import notFoundHandler from './middleware/notFound.js';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const frontendDir = path.join(projectRoot, 'frontend');

export function createApp() {
  const app = express();

  // Trust proxy in production / Docker bridge network
  app.set('trust proxy', 1);

  // Security HTTP headers
  app.use(securityMiddleware);

  // Request ID injection
  app.use(requestIdMiddleware);

  // Structured request logging
  app.use(requestLogger);

  // CORS configuration
  app.use(cors({
    origin: env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  }));

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ---------------------------------------------------------------------------
  // Security Guards: Block sensitive paths
  // ---------------------------------------------------------------------------
  app.use((req, res, next) => {
    const sensitive = [
      '/.env',
      '/.git',
      '/secrets',
      '/backups',
      '/prisma',
      '/package.json',
      '/package-lock.json',
      '/Dockerfile',
      '/docker-compose.yml'
    ];
    const lowerUrl = req.path.toLowerCase();
    for (const pattern of sensitive) {
      if (lowerUrl.startsWith(pattern) || lowerUrl.includes(pattern)) {
        return res.status(403).send('Access Denied');
      }
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // API and Health Routes (Mounted before static fallbacks)
  // ---------------------------------------------------------------------------
  app.use(routes);

  // ---------------------------------------------------------------------------
  // Static Frontend Assets & Legacy Compatibility Aliases
  // ---------------------------------------------------------------------------
  // 1. Primary modular assets mount
  app.use('/assets', express.static(path.join(frontendDir, 'assets')));
  app.use('/services', express.static(path.join(frontendDir, 'services')));

  // 2. Backward-compatible image & photo aliases
  app.use('/Photos', express.static(path.join(frontendDir, 'assets/images')));
  app.use('/images', express.static(path.join(frontendDir, 'assets/images')));
  app.get('/favicon.png', (req, res) => {
    res.sendFile(path.join(frontendDir, 'assets/images/favicon.png'));
  });

  // 3. Backward-compatible root-level CSS & JS asset serving
  app.use(express.static(path.join(frontendDir, 'assets/css')));
  app.use(express.static(path.join(frontendDir, 'assets/js')));

  // 4. Backward-compatible curriculum script path
  app.get('/functions/curriculum.js', (req, res) => {
    res.sendFile(path.join(frontendDir, 'assets/js/curriculum.js'));
  });

  // 5. Dashboard Page Routes (both clean URLs and legacy .html URLs)
  app.get([
    '/founder-dashboard.html', '/founder-dashboard', '/dashboards/founder',
    '/cofounder-dashboard.html', '/cofounder-dashboard', '/dashboards/co-founder',
    '/admin-dashboard.html', '/admin-dashboard', '/dashboards/admin'
  ], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/founder/index.html'));
  });

  app.get([
    '/hr-dashboard.html', '/hr-dashboard', '/dashboards/hr',
    '/hr-executive-dashboard.html', '/hr-executive-dashboard', '/dashboards/hr-executive',
    '/operations-dashboard.html', '/operations-dashboard', '/dashboards/operations'
  ], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/hr/index.html'));
  });

  app.get(['/tl-dashboard.html', '/tl-dashboard', '/dashboards/team-leader'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/team-leader/index.html'));
  });

  app.get(['/Intern-dashboard.html', '/intern-dashboard', '/dashboards/intern'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/intern/index.html'));
  });

  app.get(['/notes.html', '/notes'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/notes.html'));
  });

  // 6. Public Landing Page (Root)
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  // 7. General static fallback for frontend root
  app.use(express.static(frontendDir));

  // ---------------------------------------------------------------------------
  // 404 & Error Handlers
  // ---------------------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;

