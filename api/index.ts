import 'dotenv/config';
import express from 'express';
import { createCoreRouter } from '../server/routesCore.ts';
import { createOperationsRouter } from '../server/routesOperations.ts';
import { createAnalyticsAndCommsRouter } from '../server/routesAnalyticsAndComms.ts';
import { createNotificationsRouter } from '../server/routesNotifications.ts';
import { createExcelRouter } from '../server/routesExcel.ts';
import { createPlatformRouter } from '../server/routesPlatform.ts';

const app = express();
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(
  express.json({
    limit: '4mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use('/api', createPlatformRouter());
app.use('/api', createCoreRouter());
app.use('/api', createOperationsRouter());
app.use('/api', createExcelRouter());
app.use('/api', createNotificationsRouter());
app.use('/api', createAnalyticsAndCommsRouter());

export default app;
