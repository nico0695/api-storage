import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

    this.bucket = bucket;
    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: appKey,
      },
    });

    logger.info({ bucket, region }, 'Storage service initialized');
  }

  async uploadFile(key: string, buffer: Buffer, mime: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    });

    await this.s3Client.send(command);
    logger.info({ key, mime, size: buffer.length }, 'File uploaded to B2');
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

    await this.s3Client.send(command);
    logger.info({ key }, 'File deleted from B2');
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn });
    logger.info({ key, expiresIn }, 'Generated download URL');
    return url;
  }
}
