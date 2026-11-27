import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createCoreRouter } from './server/routesCore.ts';
import { createOperationsRouter } from './server/routesOperations.ts';
import { createAnalyticsAndCommsRouter } from './server/routesAnalyticsAndComms.ts';
import { createNotificationsRouter } from './server/routesNotifications.ts';
import { createExcelRouter } from './server/routesExcel.ts';
import { createPlatformRouter } from './server/routesPlatform.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Sliding-window rate limiter per IP
const rateBuckets = new Map<string, number[]>();
function rateLimiter(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = (rateBuckets.get(ip) || []).filter((ts) => now - ts < windowMs);
    if (bucket.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests, please try again shortly.' });
      return;
    }
    bucket.push(now);
    rateBuckets.set(ip, bucket);
    next();
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(
    express.json({
      limit: '15mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /register',
        'Allow: /verify',
        'Disallow: /api/',
        'Disallow: /super-admin',
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const base = `${proto}://${host}`;
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${base}/register</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${base}/login</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${base}/verify</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>`
    );
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use('/api/public', rateLimiter(60, 60_000));
  app.use('/api', rateLimiter(400, 60_000));

  app.use('/api', createPlatformRouter());
  app.use('/api', createCoreRouter());
  app.use('/api', createOperationsRouter());
  app.use('/api', createExcelRouter());
  app.use('/api', createNotificationsRouter());
  app.use('/api', createAnalyticsAndCommsRouter());

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TCMS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TCMS server:', err);
  process.exit(1);
});
