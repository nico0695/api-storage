import { z } from 'zod';

export const uploadFileSchema = z.object({
  name: z.string().min(1, 'Filename is required'),
  customName: z.string().optional(),
  mime: z.string().min(1, 'MIME type is required'),
  size: z.number().positive('File size must be positive'),
  metadata: z.record(z.unknown()).optional(),
});

export const deleteFileSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a valid number'),
});

export const getFileSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a valid number'),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
export type GetFileInput = z.infer<typeof getFileSchema>;
