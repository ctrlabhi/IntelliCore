import helmet from 'helmet';

/**
 * Enterprise Helmet configuration
 * Accommodates existing frontend visual assets, fonts, canvas neural animations,
 * and client-side pdf rendering while strictly hardening against XSS, clickjacking,
 * and MIME-sniffing.
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for inline UI scripts and canvas initialization
        "'unsafe-eval'",
        'https://cdnjs.cloudflare.com', // html2pdf bundle
        'https://www.gstatic.com',        // Google/Firebase static scripts
        'https://apis.google.com',
        'https://*.google.com'
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com'
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'data:'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https:'
      ],
      connectSrc: [
        "'self'",
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://*.googleapis.com',
        'https://*.firebaseio.com',
        'https://*.google.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com'
      ],
      frameSrc: [
        "'self'",
        'https://*.firebaseapp.com',
        'https://accounts.google.com',
        'https://*.google.com'
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'sameorigin' }
});

export default securityMiddleware;

