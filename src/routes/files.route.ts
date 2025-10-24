import { Router, Request, Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../app.js';
import { FileEntity } from '../entities/FileEntity.js';
import { StorageService } from '../services/storage.service.js';
import { uploadFileSchema, deleteFileSchema } from '../utils/validate.js';
import { logger } from '../utils/logger.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const storageService = new StorageService();

// POST /files/upload
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { originalname, mimetype, size, buffer } = req.file;

      // Validate input
      const validation = uploadFileSchema.safeParse({
        name: originalname,
        mime: mimetype,
        size,
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
        key,
        mime: mimetype,
        size,
      });
      await fileRepo.save(fileEntity);

      logger.info({ id: fileEntity.id, name: originalname }, 'File uploaded successfully');

      res.status(201).json({
        id: fileEntity.id,
        name: fileEntity.name,
        key: fileEntity.key,
        mime: fileEntity.mime,
        size: fileEntity.size,
        createdAt: fileEntity.createdAt,
      });
    } catch (error) {
      logger.error({ error }, 'Error uploading file');
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

// GET /files
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const fileRepo = AppDataSource.getRepository(FileEntity);
    const files = await fileRepo.find({ order: { createdAt: 'DESC' } });

    res.json({
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        key: file.key,
        mime: file.mime,
        size: file.size,
        createdAt: file.createdAt,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Error listing files');
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// DELETE /files/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
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
