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
const frontendDir = path.join(process.env.VERCEL === '1' ? process.cwd() : projectRoot, 'frontend');

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
  const configuredOrigins = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((s) => s.trim()) : [];
  const allowedOrigins = [
    ...configuredOrigins,
    'https://intellicoretechnologies.in',
    'https://www.intellicoretechnologies.in',
    'https://intellicore-six.vercel.app',
    'https://ctrlabhi.github.io',
    'http://127.0.0.1:3000',
    'http://localhost:3000'
  ].filter(Boolean);
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.github.io')) {
        return callback(null, true);
      }
      return callback(null, allowedOrigins[0]);
    },
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

  // Standardize browser navigation to canonical localhost:3000 origin to align with Firebase Authorized Domains (Development Only)
  app.use((req, res, next) => {
    if (
      env.NODE_ENV === 'development' &&
      req.hostname === '127.0.0.1' &&
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/health') &&
      !req.path.startsWith('/ready')
    ) {
      const targetPort = req.socket.localPort || env.PORT || 3000;
      return res.redirect(307, `http://localhost:${targetPort}${req.originalUrl}`);
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
    '/pages/dashboards/founder', '/pages/dashboards/founder/index.html',
    '/admin-dashboard.html', '/admin-dashboard', '/dashboards/admin'
  ], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/founder/index.html'));
  });

  app.get([
    '/hr-dashboard.html', '/hr-dashboard', '/dashboards/hr', '/dashboards/hr-manager',
    '/hr-executive-dashboard.html', '/hr-executive-dashboard', '/dashboards/hr-executive',
    '/operations-dashboard.html', '/operations-dashboard', '/dashboards/operations', '/dashboards/operations-executive',
    '/pages/dashboards/hr', '/pages/dashboards/hr/index.html'
  ], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/hr/index.html'));
  });

  app.get(['/tl-dashboard.html', '/tl-dashboard', '/dashboards/team-leader', '/pages/dashboards/team-leader', '/pages/dashboards/team-leader/index.html'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/team-leader/index.html'));
  });

  app.get(['/Intern-dashboard.html', '/intern-dashboard', '/dashboards/intern', '/pages/dashboards/intern', '/pages/dashboards/intern/index.html'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/dashboards/intern/index.html'));
  });

  app.get(['/notes.html', '/notes', '/pages/notes.html'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/notes.html'));
  });

  app.get(['/verify.html', '/verify', '/pages/verify.html'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages/verify.html'));
  });

  // 6. Redirect all legacy /frontend URLs to safe, clean paths permanently (HTTP 301)
  // Protected against Open-Redirect (CWE-601) by strictly sanitizing and restricting to safe same-origin internal paths.
  app.use('/frontend', (req, res) => {
    const rawOriginal = (req.originalUrl || '').split('?')[0];
    const pathOnly = rawOriginal.replace(/^\/frontend/i, '') || '/';
    // Collapse any double or multiple leading slashes (e.g. //evil.com -> /evil.com) and replace backslashes
    const normalized = pathOnly.replace(/\\/g, '/').replace(/^\/+/, '/');
    const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';

    // Disallow scheme prefixes, protocol-relative targets, or any non-slash start
    if (!normalized.startsWith('/') || normalized.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) {
      return res.redirect(301, '/' + search);
    }

    let target = '/';
    if (normalized === '/' || normalized === '/index.html') {
      target = '/';
    } else if (normalized.startsWith('/pages/dashboards/founder') || normalized.startsWith('/dashboards/founder')) {
      target = '/dashboards/founder';
    } else if (normalized.startsWith('/pages/dashboards/hr') || normalized.startsWith('/dashboards/hr')) {
      target = '/dashboards/hr';
    } else if (normalized.startsWith('/pages/dashboards/team-leader') || normalized.startsWith('/dashboards/team-leader')) {
      target = '/dashboards/team-leader';
    } else if (normalized.startsWith('/pages/dashboards/intern') || normalized.startsWith('/dashboards/intern')) {
      target = '/dashboards/intern';
    } else if (normalized.includes('notes.html') || normalized === '/notes') {
      target = '/notes.html';
    } else if (/^\/(assets|services|Photos|images)\//i.test(normalized)) {
      target = normalized;
    } else {
      // Safe default for any unmapped paths
      target = '/';
    }
    return res.redirect(301, target + search);
  });

  // Public Landing Page (Root)
  app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  // 7. General static fallback for assets
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

