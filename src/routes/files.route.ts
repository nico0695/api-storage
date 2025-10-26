import { Router, Request, Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../app.js';
import { FileEntity } from '../entities/FileEntity.js';
import { StorageService } from '../services/storage.service.js';
import {
  uploadFileSchema,
  deleteFileSchema,
  getFileSchema,
  listFilesQuerySchema,
} from '../utils/validate.js';
import { logger } from '../utils/logger.js';
import { authenticateAPIKey } from '../middleware/auth.middleware.js';
import { Like, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const storageService = new StorageService();

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

    logger.info(
      { filters: { search, mime, minSize, maxSize, dateFrom, dateTo }, total, page, limit },
      'Files listed with filters'
    );

    res.json({
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        customName: file.customName,
        key: file.key,
        mime: file.mime,
        size: file.size,
        metadata: file.metadata,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })),
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

export default router;
