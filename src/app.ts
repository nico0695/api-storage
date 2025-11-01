import './config.js';
import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { createFilesRouter } from './routes/files.route.js';
import { createShareRouter } from './routes/share.route.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { logger } from './utils/logger.js';
import { AppDataSource } from './data-source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(): Promise<Application> {
  const app = express();

  // Middleware
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://api-storage-front.vercel.app',
  ];
  const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // Ensure caches vary by Origin
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(pinoHttp({ logger }));

  // Routes
  app.use('/files', createFilesRouter());
  app.use('/share', createShareRouter());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export async function initializeDatabase(): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info({ dataDir }, 'Created data directory');
  }

  await AppDataSource.initialize();
  logger.info('Database initialized');
}
