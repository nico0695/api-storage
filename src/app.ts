import './config.js';
import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import pinoHttp from 'pino-http';
import { FileEntity } from './entities/FileEntity.js';
import filesRouter from './routes/files.route.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize TypeORM DataSource
export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(__dirname, 'data', 'database.sqlite'),
  entities: [FileEntity],
  synchronize: true,
  logging: false,
});

export async function createApp(): Promise<Application> {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(pinoHttp({ logger }));

  // Routes
  app.use('/files', filesRouter);

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
