import { Router, Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { FileEntity } from '../entities/FileEntity.js';
import { ShareLinkEntity } from '../entities/ShareLinkEntity.js';
import { StorageService } from '../services/storage.service.js';
import {
  uploadFileSchema,
  deleteFileSchema,
  getFileSchema,
  listFilesQuerySchema,
  createShareLinkSchema,
  normalizePath,
} from '../utils/validate.js';
import { generateShareToken } from '../utils/generate-key.js';
import { logger } from '../utils/logger.js';
import { authenticateAPIKey } from '../middleware/auth.middleware.js';
import { Like, Between, MoreThanOrEqual, LessThanOrEqual, MoreThan, In } from 'typeorm';

type StorageServiceLike = Pick<StorageService, 'uploadFile' | 'deleteFile' | 'getDownloadUrl'>;
type LoggerLike = Pick<typeof logger, 'info' | 'warn' | 'error'>;

export interface FilesRouterDeps {
  storageService?: StorageServiceLike;
  dataSource?: Pick<DataSource, 'getRepository'>;
  logger?: LoggerLike;
  authenticateMiddleware?: RequestHandler;
}

// Default TTL for share links: 7 days (in seconds)
const DEFAULT_TTL = 7 * 24 * 60 * 60;

/**
 * Generates the full path for a file (combining path and filename)
 * @param path - The directory path (nullable)
 * @param filename - The filename
 * @returns Full path string
 */
function getFullPath(path: string | null, filename: string): string {
  return path ? `${path}/${filename}` : filename;
}

export function createFilesRouter({
  storageService = new StorageService(),
  dataSource = AppDataSource,
  logger: loggerLike = logger,
  authenticateMiddleware = authenticateAPIKey,
}: FilesRouterDeps = {}): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });
  const log = loggerLike;

  // POST /files/upload
  router.post(
    '/upload',
    authenticateMiddleware,
    upload.single('file'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const { originalname, mimetype, size, buffer } = req.file;
        const { customName, metadata, path: rawPath } = req.body;

        // Parse metadata if it's a string
        let parsedMetadata = metadata;
        if (typeof metadata === 'string') {
          try {
            parsedMetadata = JSON.parse(metadata);
          } catch {
            res.status(400).json({ error: 'Invalid metadata JSON format' });
            return;
          }
        }

        // Validate input
        const validation = uploadFileSchema.safeParse({
          name: originalname,
          customName: customName || undefined,
          path: rawPath || undefined,
          mime: mimetype,
          size,
          metadata: parsedMetadata || undefined,
        });

        if (!validation.success) {
          res.status(400).json({ error: validation.error.errors });
          return;
        }

        // Normalize and validate path
        let normalizedPath: string | null = null;
        try {
          normalizedPath = normalizePath(rawPath);
        } catch (error) {
          res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid path' });
          return;
        }

        // Get user ID from authenticated API key
        if (!req.apiKey) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const userId = req.apiKey.id;

        // Generate unique key with user folder structure
        // Format: {userId}/{path}/{timestamp}-{filename}
        const timestamp = Date.now();
        const key = normalizedPath
          ? `${userId}/${normalizedPath}/${timestamp}-${originalname}`
          : `${userId}/${timestamp}-${originalname}`;

        // Upload to B2
        await storageService.uploadFile(key, buffer, mimetype);

        // Save metadata to database
        const fileRepo = dataSource.getRepository(FileEntity);
        const fileEntity = fileRepo.create({
          name: originalname,
          customName: customName || null,
          key,
          path: normalizedPath,
          mime: mimetype,
          size,
          metadata: parsedMetadata || null,
        });
        await fileRepo.save(fileEntity);

        log.info(
          { id: fileEntity.id, name: originalname, path: normalizedPath, userId },
          'File uploaded successfully'
        );

        res.status(201).json({
          id: fileEntity.id,
          name: fileEntity.name,
          customName: fileEntity.customName,
          key: fileEntity.key,
          path: fileEntity.path,
          fullPath: getFullPath(fileEntity.path, fileEntity.name),
          mime: fileEntity.mime,
          size: fileEntity.size,
          metadata: fileEntity.metadata,
          createdAt: fileEntity.createdAt,
          updatedAt: fileEntity.updatedAt,
        });
      } catch (error) {
        log.error({ error }, 'Error uploading file');
        res.status(500).json({ error: 'Failed to upload file' });
      }
    }
  );

  // GET /files
  router.get('/', authenticateMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const validation = listFilesQuerySchema.safeParse(req.query);

      if (!validation.success) {
        res.status(400).json({ error: validation.error.errors });
        return;
      }

      const { search, searchPath, mime, minSize, maxSize, dateFrom, dateTo, page, limit } =
        validation.data;

      const fileRepo = dataSource.getRepository(FileEntity);

      // Get user ID from authenticated API key
      if (!req.apiKey) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const userId = req.apiKey.id;

      // Build where conditions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};

      // Filter by user (all files must belong to this user)
      where.key = Like(`${userId}/%`);

      // Search by name (case-insensitive)
      if (search) {
        where.name = Like(`%${search}%`);
      }

      // Search by path (case-insensitive)
      if (searchPath) {
        where.path = Like(`%${searchPath}%`);
      }

      // Filter by MIME type
      if (mime) {
        where.mime = mime;
      }

      // Filter by size range
      if (minSize !== undefined && maxSize !== undefined) {
        where.size = Between(minSize, maxSize);
      } else if (minSize !== undefined) {
        where.size = MoreThanOrEqual(minSize);
      } else if (maxSize !== undefined) {
        where.size = LessThanOrEqual(maxSize);
      }

      // Filter by date range
      if (dateFrom && dateTo) {
        where.createdAt = Between(new Date(dateFrom), new Date(dateTo));
      } else if (dateFrom) {
        where.createdAt = MoreThanOrEqual(new Date(dateFrom));
      } else if (dateTo) {
        where.createdAt = LessThanOrEqual(new Date(dateTo));
      }

      // Get total count for pagination
      const total = await fileRepo.count({ where });

      // Get paginated files
      const files = await fileRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
        skip: (page - 1) * limit,
      });

      // Get active share links for all files
      const fileIds = files.map((f) => f.id);
      const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
      const shareLinks =
        fileIds.length > 0
          ? await shareLinkRepo.find({
              where: {
                fileId: In(fileIds),
                isActive: true,
                expiresAt: MoreThan(new Date()),
              },
            })
          : [];

      // Map share links by fileId
      const shareLinksByFile = shareLinks.reduce(
        (acc, link) => {
          if (!acc[link.fileId]) {
            acc[link.fileId] = [];
          }
          acc[link.fileId].push(link);
          return acc;
        },
        {} as Record<number, ShareLinkEntity[]>
      );

      log.info(
        {
          filters: { search, searchPath, mime, minSize, maxSize, dateFrom, dateTo },
          total,
          page,
          limit,
          userId,
        },
        'Files listed with filters'
      );

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

      res.json({
        files: files.map((file) => {
          const activeShareLinks = (shareLinksByFile[file.id] || []).map((link) => ({
            token: link.token,
            shareUrl: `${baseUrl}/share/${link.token}`,
            expiresAt: link.expiresAt,
            hasPassword: !!link.password,
            accessCount: link.accessCount,
          }));

          return {
            id: file.id,
            name: file.name,
            customName: file.customName,
            key: file.key,
            path: file.path,
            fullPath: getFullPath(file.path, file.name),
            mime: file.mime,
            size: file.size,
            metadata: file.metadata,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
            shareLinks: activeShareLinks,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      log.error({ error }, 'Error listing files');
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // GET /files/:id
  router.get('/:id', authenticateMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = getFileSchema.safeParse({ id: req.params.id });

      if (!validation.success) {
        res.status(400).json({ error: validation.error.errors });
        return;
      }

      const fileId = parseInt(req.params.id, 10);
      const fileRepo = dataSource.getRepository(FileEntity);

      // Get user ID from authenticated API key
      if (!req.apiKey) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const userId = req.apiKey.id;

      // Find file and verify ownership
      const file = await fileRepo.findOne({ where: { id: fileId } });

      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Verify that the file belongs to the authenticated user
      if (!file.key.startsWith(`${userId}/`)) {
        res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
        return;
      }

      // Generate download URL
      const downloadUrl = await storageService.getDownloadUrl(file.key);

      // Get active share links for this file
      const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
      const shareLinks = await shareLinkRepo.find({
        where: {
          fileId,
          isActive: true,
          expiresAt: MoreThan(new Date()),
        },
        order: { createdAt: 'DESC' },
      });

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

      log.info({ id: fileId, key: file.key, userId }, 'File details retrieved');

      res.json({
        id: file.id,
        name: file.name,
        customName: file.customName,
        key: file.key,
        path: file.path,
        fullPath: getFullPath(file.path, file.name),
        mime: file.mime,
        size: file.size,
        metadata: file.metadata,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        downloadUrl,
        shareLinks: shareLinks.map((link) => ({
          token: link.token,
          shareUrl: `${baseUrl}/share/${link.token}`,
          expiresAt: link.expiresAt,
          hasPassword: !!link.password,
          accessCount: link.accessCount,
        })),
      });
    } catch (error) {
      log.error({ error }, 'Error retrieving file details');
      res.status(500).json({ error: 'Failed to retrieve file details' });
    }
  });

  // DELETE /files/:id
  router.delete(
    '/:id',
    authenticateMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const validation = deleteFileSchema.safeParse({ id: req.params.id });

        if (!validation.success) {
          res.status(400).json({ error: validation.error.errors });
          return;
        }

        const fileId = parseInt(req.params.id, 10);
        const fileRepo = dataSource.getRepository(FileEntity);

        // Get user ID from authenticated API key
        if (!req.apiKey) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const userId = req.apiKey.id;

        // Find file
        const file = await fileRepo.findOne({ where: { id: fileId } });

        if (!file) {
          res.status(404).json({ error: 'File not found' });
          return;
        }

        // Verify that the file belongs to the authenticated user
        if (!file.key.startsWith(`${userId}/`)) {
          res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
          return;
        }

        // Delete from B2
        await storageService.deleteFile(file.key);

        // Delete from database
        await fileRepo.remove(file);

        log.info({ id: fileId, key: file.key, userId }, 'File deleted successfully');

        res.json({ message: 'File deleted successfully' });
      } catch (error) {
        log.error({ error }, 'Error deleting file');
        res.status(500).json({ error: 'Failed to delete file' });
      }
    }
  );

  // POST /files/:id/share - Create share link (protected)
  router.post(
    '/:id/share',
    authenticateMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const validation = createShareLinkSchema.safeParse({
          id: req.params.id,
          ttl: req.body.ttl,
          password: req.body.password,
        });

        if (!validation.success) {
          res.status(400).json({ error: validation.error.errors });
          return;
        }

        const { id, ttl, password } = validation.data;
        const fileId = parseInt(id, 10);

        // Get user ID from authenticated API key
        if (!req.apiKey) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const userId = req.apiKey.id;

        // Check if file exists
        const fileRepo = dataSource.getRepository(FileEntity);
        const file = await fileRepo.findOne({ where: { id: fileId } });

        if (!file) {
          res.status(404).json({ error: 'File not found' });
          return;
        }

        // Verify that the file belongs to the authenticated user
        if (!file.key.startsWith(`${userId}/`)) {
          res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
          return;
        }

        // Generate token and expiration
        const token = generateShareToken();
        const ttlSeconds = ttl || DEFAULT_TTL;
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

        // Hash password if provided
        let hashedPassword: string | null = null;
        if (password) {
          hashedPassword = await bcrypt.hash(password, 10);
        }

        // Create share link
        const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
        const shareLink = shareLinkRepo.create({
          token,
          fileId,
          expiresAt,
          password: hashedPassword,
        });
        await shareLinkRepo.save(shareLink);

        log.info({ fileId, token, expiresAt }, 'Share link created');

        // Build share URL (using request origin or configured base URL)
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const shareUrl = `${baseUrl}/share/${token}`;

        res.status(201).json({
          shareUrl,
          token,
          expiresAt,
          hasPassword: !!password,
          ttl: ttlSeconds,
        });
      } catch (error) {
        log.error({ error }, 'Error creating share link');
        res.status(500).json({ error: 'Failed to create share link' });
      }
    }
  );

  // GET /files/:id/shares - List all share links for a file (protected)
  router.get(
    '/:id/shares',
    authenticateMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate as file ID directly
        const fileId = parseInt(req.params.id, 10);
        if (isNaN(fileId)) {
          res.status(400).json({ error: 'Invalid file ID' });
          return;
        }

        // Get user ID from authenticated API key
        if (!req.apiKey) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const userId = req.apiKey.id;

        // Verify file exists and belongs to user
        const fileRepo = dataSource.getRepository(FileEntity);
        const file = await fileRepo.findOne({ where: { id: fileId } });

        if (!file) {
          res.status(404).json({ error: 'File not found' });
          return;
        }

        // Verify that the file belongs to the authenticated user
        if (!file.key.startsWith(`${userId}/`)) {
          res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
          return;
        }

        const shareLinkRepo = dataSource.getRepository(ShareLinkEntity);
        const shareLinks = await shareLinkRepo.find({
          where: {
            fileId,
            isActive: true,
            expiresAt: MoreThan(new Date()),
          },
          order: { createdAt: 'DESC' },
        });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

        res.json({
          shares: shareLinks.map((link) => ({
            token: link.token,
            shareUrl: `${baseUrl}/share/${link.token}`,
            expiresAt: link.expiresAt,
            hasPassword: !!link.password,
            accessCount: link.accessCount,
            createdAt: link.createdAt,
          })),
        });
      } catch (error) {
        log.error({ error }, 'Error listing share links');
        res.status(500).json({ error: 'Failed to list share links' });
      }
    }
  );

  return router;
}
