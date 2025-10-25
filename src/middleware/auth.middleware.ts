import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../app.js';
import { APIKeyEntity } from '../entities/APIKeyEntity.js';
import { logger } from '../utils/logger.js';

// Extend Express Request to include apiKey info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: {
        id: number;
        name: string;
      };
    }
  }
}

/**
 * Middleware to validate API key from X-API-Key header
 * Checks if the key exists in the database and is active
 */
export async function authenticateAPIKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      logger.warn({ path: req.path }, 'Missing API key');
      res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
      return;
    }

    const apiKeyRepo = AppDataSource.getRepository(APIKeyEntity);
    const keyRecord = await apiKeyRepo.findOne({
      where: { key: apiKey, isActive: true },
    });

    if (!keyRecord) {
      logger.warn(
        { path: req.path, key: apiKey.slice(0, 10) + '...' },
        'Invalid or inactive API key'
      );
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }

    // Attach key info to request for logging purposes
    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
    };

    logger.info({ consumer: keyRecord.name, path: req.path }, 'Authenticated request');
    next();
  } catch (error) {
    logger.error({ error }, 'Error validating API key');
    res.status(500).json({ error: 'Authentication error' });
  }
}
