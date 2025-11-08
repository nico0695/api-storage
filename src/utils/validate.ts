import { z } from 'zod';

/**
 * Escapes SQL LIKE special characters to prevent wildcard injection
 * @param str - The string to escape
 * @returns Escaped string safe for use in LIKE patterns
 */
export function escapeLikeString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Normalizes a file path for storage
 * @param path - The path to normalize
 * @returns Normalized path or null if empty
 * @throws Error if path contains invalid characters or patterns
 */
export function normalizePath(path?: string | null): string | null {
  if (!path || typeof path !== 'string') {
    return null;
  }

  // Trim and remove leading/trailing slashes
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');

  if (!normalized) {
    return null;
  }

  if (normalized.includes('..')) {
    throw new Error('Path cannot contain ".."');
  }
  if (normalized.includes('//')) {
    throw new Error('Path cannot contain consecutive slashes');
  }
  if (!/^[a-zA-Z0-9/_-]*$/.test(normalized)) {
    throw new Error('Path contains invalid characters. Allowed: letters, numbers, /, _, -');
  }

  return normalized;
}

export const uploadFileSchema = z.object({
  name: z.string().min(1, 'Filename is required'),
  customName: z.string().optional(),
  path: z.string().optional(),
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

export const listFilesQuerySchema = z.object({
  search: z.string().optional(),
  searchPath: z.string().optional(),
  mime: z.string().optional(),
  minSize: z.string().regex(/^\d+$/).transform(Number).optional(),
  maxSize: z.string().regex(/^\d+$/).transform(Number).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('50'),
});

export const createShareLinkSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a valid number'),
  ttl: z.string().regex(/^\d+$/).transform(Number).optional(),
  password: z.string().min(4, 'Password must be at least 4 characters').optional(),
});

export const getShareLinkSchema = z.object({
  token: z.string().startsWith('share_', 'Invalid share token format'),
});

export const accessShareLinkSchema = z.object({
  token: z.string().startsWith('share_', 'Invalid share token format'),
  password: z.string().optional(),
});

export const deleteShareLinkSchema = z.object({
  token: z.string().startsWith('share_', 'Invalid share token format'),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
export type GetFileInput = z.infer<typeof getFileSchema>;
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
export type GetShareLinkInput = z.infer<typeof getShareLinkSchema>;
export type AccessShareLinkInput = z.infer<typeof accessShareLinkSchema>;
export type DeleteShareLinkInput = z.infer<typeof deleteShareLinkSchema>;
