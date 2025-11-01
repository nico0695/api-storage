import { Router, Request, Response, RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { ShareLinkEntity } from '../entities/ShareLinkEntity.js';
import { StorageService } from '../services/storage.service.js';
import { accessShareLinkSchema, deleteShareLinkSchema } from '../utils/validate.js';
import { logger } from '../utils/logger.js';
import { authenticateAPIKey } from '../middleware/auth.middleware.js';

type StorageServiceLike = Pick<StorageService, 'getDownloadUrl'>;
type LoggerLike = Pick<typeof logger, 'info' | 'warn' | 'error'>;

export interface ShareRouterDeps {
  storageService?: StorageServiceLike;
  dataSource?: Pick<DataSource, 'getRepository'>;
  logger?: LoggerLike;
  authenticateMiddleware?: RequestHandler;
}

export function createShareRouter({
  storageService = new StorageService(),
  dataSource = AppDataSource,
  logger: loggerLike = logger,
  authenticateMiddleware = authenticateAPIKey,
}: ShareRouterDeps = {}): Router {
  const router = Router();
  const log = loggerLike;

  // GET /share/:token - Access shared file (PUBLIC)
  router.get('/:token', async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = accessShareLinkSchema.safeParse({
        token: req.params.token,
        password: req.query.password || req.body.password,
      });

      if (!validation.success) {
        res.status(400).json({ error: validation.error.errors });
        return;
      }

      const { token, password } = validation.data;

      // Find share link
      const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
      const shareLink = await shareLinkRepo.findOne({
        where: { token },
        relations: ['file'],
      });

      if (!shareLink) {
        res.status(404).json({ error: 'Share link not found' });
        return;
      }

      // Check if active
      if (!shareLink.isActive) {
        res.status(403).json({ error: 'Share link has been revoked' });
        return;
      }

      // Check if expired
      if (new Date() > shareLink.expiresAt) {
        res.status(410).json({ error: 'Share link has expired' });
        return;
      }

      // Check password if required
      if (shareLink.password) {
        if (!password) {
          res.status(401).json({ error: 'Password required', requiresPassword: true });
          return;
        }

        const isPasswordValid = await bcrypt.compare(password, shareLink.password);
        if (!isPasswordValid) {
          res.status(401).json({ error: 'Invalid password' });
          return;
        }
      }

      // Increment access count
      shareLink.accessCount += 1;
      await shareLinkRepo.save(shareLink);

      // Generate download URL
      const downloadUrl = await storageService.getDownloadUrl(shareLink.file.key);

      log.info(
        { token, fileId: shareLink.fileId, accessCount: shareLink.accessCount },
        'Share link accessed'
      );

      res.json({
        file: {
          id: shareLink.file.id,
          name: shareLink.file.name,
          customName: shareLink.file.customName,
          mime: shareLink.file.mime,
          size: shareLink.file.size,
          createdAt: shareLink.file.createdAt,
        },
        downloadUrl,
        expiresAt: shareLink.expiresAt,
        accessCount: shareLink.accessCount,
      });
    } catch (error) {
      log.error({ error }, 'Error accessing share link');
      res.status(500).json({ error: 'Failed to access share link' });
    }
  });

  // DELETE /share/:token - Revoke share link (protected)
  router.delete(
    '/:token',
    authenticateMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const validation = deleteShareLinkSchema.safeParse({ token: req.params.token });

        if (!validation.success) {
          res.status(400).json({ error: validation.error.errors });
          return;
        }

        const { token } = validation.data;

        const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
        const shareLink = await shareLinkRepo.findOne({ where: { token } });

        if (!shareLink) {
          res.status(404).json({ error: 'Share link not found' });
          return;
        }

        // Mark as inactive (soft delete)
        shareLink.isActive = false;
        await shareLinkRepo.save(shareLink);

        log.info({ token, fileId: shareLink.fileId }, 'Share link revoked');

        res.json({ message: 'Share link revoked successfully' });
      } catch (error) {
        log.error({ error }, 'Error revoking share link');
        res.status(500).json({ error: 'Failed to revoke share link' });
      }
    }
  );

  return router;
}
