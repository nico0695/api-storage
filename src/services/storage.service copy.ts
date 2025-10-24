import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION;
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APP_KEY;
    const bucket = process.env.B2_BUCKET;

    if (!endpoint || !region || !keyId || !appKey || !bucket) {
      throw new Error('Missing required B2 environment variables');
    }

    // Basic sanity checks to help catch common misconfigs
    const endpointRegionMatch = /s3\.(.+?)\./.exec(endpoint || '');
    const endpointRegion = endpointRegionMatch?.[1];
    let resolvedRegion = region;
    if (endpointRegion && endpointRegion !== region) {
      logger.warn({ endpoint, endpointRegion, region }, 'Region and endpoint mismatch for B2 S3');
      // Prefer the region embedded in the endpoint to avoid SigV4 scope mismatch
      resolvedRegion = endpointRegion;
    }
    if (!/^[A-Za-z0-9]{6,}$/.test(keyId)) {
      logger.warn('B2_KEY_ID format looks unusual; double-check application key ID');
    }
    this.bucket = bucket;
    this.s3Client = new S3Client({
      endpoint,
      region: resolvedRegion,
      forcePathStyle: true,
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: appKey,
      },
    });

    logger.info({ bucket, region: resolvedRegion, endpoint }, 'Storage service initialized');
  }

  async uploadFile(key: string, buffer: Buffer, mime: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    });

    try {
      await this.s3Client.send(command);
      logger.info({ key, mime, size: buffer.length }, 'File uploaded to B2');
    } catch (err: unknown) {
      const meta =
        (
          err as {
            $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string };
          }
        )?.$metadata || {};
      const code =
        (err as { Code?: string; name?: string })?.Code || (err as { name?: string })?.name;
      const message = (err as { message?: string })?.message;
      logger.error(
        {
          key,
          code,
          message,
          httpStatusCode: meta.httpStatusCode,
          requestId: meta.requestId,
          extendedRequestId: meta.extendedRequestId,
        },
        'B2 S3 PutObject failed'
      );
      throw err;
    }
  }

  async listFiles(): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
    });

    const response = await this.s3Client.send(command);
    const files = response.Contents || [];

    return files.map((file) => ({
      key: file.Key || '',
      size: file.Size || 0,
      lastModified: file.LastModified,
    }));
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      logger.info({ key }, 'File deleted from B2');
    } catch (err: unknown) {
      const meta =
        (
          err as {
            $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string };
          }
        )?.$metadata || {};
      const code =
        (err as { Code?: string; name?: string })?.Code || (err as { name?: string })?.name;
      const message = (err as { message?: string })?.message;
      logger.error(
        {
          key,
          code,
          message,
          httpStatusCode: meta.httpStatusCode,
          requestId: meta.requestId,
          extendedRequestId: meta.extendedRequestId,
        },
        'B2 S3 DeleteObject failed'
      );
      throw err;
    }
  }
}
