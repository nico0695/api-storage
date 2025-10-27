import { Router, Request, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../app.js';
import { FileEntity } from '../entities/FileEntity.js';
import { ShareLinkEntity } from '../entities/ShareLinkEntity.js';
import { StorageService } from '../services/storage.service.js';
import {
  uploadFileSchema,
  deleteFileSchema,
  getFileSchema,
  listFilesQuerySchema,
  createShareLinkSchema,
} from '../utils/validate.js';
import { generateShareToken } from '../utils/generate-key.js';
import { logger } from '../utils/logger.js';
import { authenticateAPIKey } from '../middleware/auth.middleware.js';
import { Like, Between, MoreThanOrEqual, LessThanOrEqual, MoreThan, In } from 'typeorm';
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const storageService = new StorageService();

// Default TTL for share links: 7 days (in seconds)
const DEFAULT_TTL = 7 * 24 * 60 * 60;

// POST /files/upload
router.post(
  '/upload',
  authenticateAPIKey,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { originalname, mimetype, size, buffer } = req.file;
      const { customName, metadata } = req.body;

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
        mime: mimetype,
        size,
        metadata: parsedMetadata || undefined,
      });

      if (!validation.success) {
        res.status(400).json({ error: validation.error.errors });
        return;
      }

      // Generate unique key
      const key = `${Date.now()}-${originalname}`;

      // Upload to B2
      await storageService.uploadFile(key, buffer, mimetype);

      // Save metadata to database
      const fileRepo = AppDataSource.getRepository(FileEntity);
      const fileEntity = fileRepo.create({
        name: originalname,
        customName: customName || null,
        key,
        mime: mimetype,
        size,
        metadata: parsedMetadata || null,
      });
      await fileRepo.save(fileEntity);

      logger.info({ id: fileEntity.id, name: originalname }, 'File uploaded successfully');

      res.status(201).json({
        id: fileEntity.id,
        name: fileEntity.name,
        customName: fileEntity.customName,
        key: fileEntity.key,
        mime: fileEntity.mime,
        size: fileEntity.size,
        metadata: fileEntity.metadata,
        createdAt: fileEntity.createdAt,
        updatedAt: fileEntity.updatedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Error uploading file');
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

// GET /files
router.get('/', authenticateAPIKey, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const validation = listFilesQuerySchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors });
      return;
    }

    const { search, mime, minSize, maxSize, dateFrom, dateTo, page, limit } = validation.data;

    const fileRepo = AppDataSource.getRepository(FileEntity);

    // Build where conditions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Search by name (case-insensitive)
    if (search) {
      where.name = Like(`%${search}%`);
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
    const shareLinkRepo = AppDataSource.getRepository(ShareLinkEntity);
    const shareLinks = await shareLinkRepo.find({
      where: {
        fileId: In(fileIds),
        isActive: true,
        expiresAt: MoreThan(new Date()),
      },
    });

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

    logger.info(
      { filters: { search, mime, minSize, maxSize, dateFrom, dateTo }, total, page, limit },
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
    logger.error({ error }, 'Error listing files');
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /files/:id
router.get('/:id', authenticateAPIKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = getFileSchema.safeParse({ id: req.params.id });

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    const fileRepo = AppDataSource.getRepository(FileEntity);
    const file = await fileRepo.findOne({ where: { id: fileId } });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Generate download URL
    const downloadUrl = await storageService.getDownloadUrl(file.key);

    // Get active share links for this file
    const shareLinkRepo = AppDataSource.getRepository(ShareLinkEntity);
    const shareLinks = await shareLinkRepo.find({
      where: {
        fileId,
        isActive: true,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    logger.info({ id: fileId, key: file.key }, 'File details retrieved');

    res.json({
      id: file.id,
      name: file.name,
      customName: file.customName,
      key: file.key,
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
    logger.error({ error }, 'Error retrieving file details');
    res.status(500).json({ error: 'Failed to retrieve file details' });
  }
});

// DELETE /files/:id
router.delete('/:id', authenticateAPIKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = deleteFileSchema.safeParse({ id: req.params.id });

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    const fileRepo = AppDataSource.getRepository(FileEntity);
    const file = await fileRepo.findOne({ where: { id: fileId } });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Delete from B2
    await storageService.deleteFile(file.key);

    // Delete from database
    await fileRepo.remove(file);

    logger.info({ id: fileId, key: file.key }, 'File deleted successfully');

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Error deleting file');
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST /files/:id/share - Create share link (protected)
router.post(
  '/:id/share',
  authenticateAPIKey,
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

      // Check if file exists
      const fileRepo = AppDataSource.getRepository(FileEntity);
      const file = await fileRepo.findOne({ where: { id: fileId } });

      if (!file) {
        res.status(404).json({ error: 'File not found' });
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
      const shareLinkRepo = AppDataSource.getRepository(ShareLinkEntity);
      const shareLink = shareLinkRepo.create({
        token,
        fileId,
        expiresAt,
        password: hashedPassword,
      });
      await shareLinkRepo.save(shareLink);

      logger.info({ fileId, token, expiresAt }, 'Share link created');

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
      logger.error({ error }, 'Error creating share link');
      res.status(500).json({ error: 'Failed to create share link' });
    }
  }
);

// GET /files/:id/shares - List all share links for a file (protected)
router.get(
  '/:id/shares',
  authenticateAPIKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate as file ID directly
      const fileId = parseInt(req.params.id, 10);
      if (isNaN(fileId)) {
        res.status(400).json({ error: 'Invalid file ID' });
        return;
      }

      const shareLinkRepo = AppDataSource.getRepository(ShareLinkEntity);
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
      logger.error({ error }, 'Error listing share links');
      res.status(500).json({ error: 'Failed to list share links' });
    }
  }
);

export default router;
