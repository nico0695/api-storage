import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { createFilesRouter } from '../routes/files.route.js';
import { createShareRouter } from '../routes/share.route.js';
import { FileEntity } from '../entities/FileEntity.js';
import { ShareLinkEntity } from '../entities/ShareLinkEntity.js';
import { APIKeyEntity } from '../entities/APIKeyEntity.js';
import { createAuthenticateAPIKeyMiddleware } from '../middleware/auth.middleware.js';
import { generateAPIKey } from '../utils/generate-key.js';
import type { StorageService } from '../services/storage.service.js';

type AsyncVoidFn = (...args: unknown[]) => Promise<void>;
type AsyncStringFn = (...args: unknown[]) => Promise<string>;

type StorageStub = {
  uploadFile: jest.MockedFunction<AsyncVoidFn>;
  deleteFile: jest.MockedFunction<AsyncVoidFn>;
  getDownloadUrl: jest.MockedFunction<AsyncStringFn>;
};

describe('Files & Share routers (integration)', () => {
  let dataSource: DataSource;
  let app: express.Express;
  let storageStub: StorageStub;
  let storageService: Pick<StorageService, 'uploadFile' | 'deleteFile' | 'getDownloadUrl'>;
  let apiKey: string;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      dropSchema: true,
      entities: [FileEntity, ShareLinkEntity, APIKeyEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    const uploadFileMock = jest.fn(async () => undefined) as jest.MockedFunction<AsyncVoidFn>;
    const deleteFileMock = jest.fn(async () => undefined) as jest.MockedFunction<AsyncVoidFn>;
    const getDownloadUrlMock = jest.fn(async () => 'https://example.com/download') as jest.MockedFunction<AsyncStringFn>;

    storageStub = {
      uploadFile: uploadFileMock,
      deleteFile: deleteFileMock,
      getDownloadUrl: getDownloadUrlMock,
    };
    storageService = storageStub as unknown as Pick<
      StorageService,
      'uploadFile' | 'deleteFile' | 'getDownloadUrl'
    >;

    const authenticate = createAuthenticateAPIKeyMiddleware({
      dataSource,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    const loggerStub = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(
      '/files',
      createFilesRouter({
        dataSource,
        storageService,
        logger: loggerStub,
        authenticateMiddleware: authenticate,
      })
    );
    app.use(
      '/share',
      createShareRouter({
        dataSource,
        storageService,
        logger: loggerStub,
        authenticateMiddleware: authenticate,
      })
    );
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await dataSource.getRepository(ShareLinkEntity).clear();
    await dataSource.getRepository(FileEntity).clear();
    await dataSource.getRepository(APIKeyEntity).clear();

    const apiKeyRepo = dataSource.getRepository(APIKeyEntity);
    apiKey = generateAPIKey();
    const record = apiKeyRepo.create({ key: apiKey, name: 'test-suite', isActive: true });
    await apiKeyRepo.save(record);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('returns 401 when API key is missing on protected routes', async () => {
    const response = await request(app).get('/files');
    expect(response.status).toBe(401);
  });

  it('lists files with active share links', async () => {
    const fileRepo = dataSource.getRepository(FileEntity);
    const shareRepo = dataSource.getRepository(ShareLinkEntity);

    const file = fileRepo.create({
      name: 'document.pdf',
      customName: null,
      key: 'file-key',
      mime: 'application/pdf',
      size: 1234,
      metadata: null,
    });
    await fileRepo.save(file);

    const share = shareRepo.create({
      token: 'share_token_123',
      fileId: file.id,
      file,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      password: null,
      isActive: true,
      accessCount: 0,
    });
    await shareRepo.save(share);

    const response = await request(app).get('/files').set('X-API-Key', apiKey);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0]).toMatchObject({
      id: file.id,
      name: 'document.pdf',
    });
    expect(response.body.files[0].shareLinks[0]).toMatchObject({
      token: 'share_token_123',
      hasPassword: false,
    });
  });

  it('returns file details with a signed download URL', async () => {
    const fileRepo = dataSource.getRepository(FileEntity);
    const shareRepo = dataSource.getRepository(ShareLinkEntity);

    const file = await fileRepo.save(
      fileRepo.create({
        name: 'image.png',
        customName: null,
        key: 'image-key',
        mime: 'image/png',
        size: 512,
        metadata: null,
      })
    );

    await shareRepo.save(
      shareRepo.create({
        token: 'share_token_detail',
        fileId: file.id,
        file,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        password: null,
        isActive: true,
        accessCount: 0,
      })
    );

    storageStub.getDownloadUrl.mockResolvedValueOnce('https://signed.example.com/file');

    const response = await request(app).get(`/files/${file.id}`).set('X-API-Key', apiKey);

    expect(response.status).toBe(200);
    expect(storageStub.getDownloadUrl).toHaveBeenCalledWith('image-key');
    expect(response.body.downloadUrl).toBe('https://signed.example.com/file');
    expect(response.body.shareLinks).toHaveLength(1);
  });

  it('creates share links with hashed passwords via POST /files/:id/share', async () => {
    const fileRepo = dataSource.getRepository(FileEntity);
    const shareRepo = dataSource.getRepository(ShareLinkEntity);

    const file = await fileRepo.save(
      fileRepo.create({
        name: 'archive.zip',
        customName: null,
        key: 'archive-key',
        mime: 'application/zip',
        size: 2048,
        metadata: null,
      })
    );

    const response = await request(app)
      .post(`/files/${file.id}/share`)
      .set('X-API-Key', apiKey)
      .send({ ttl: '1800', password: 'secret123' });

    expect(response.status).toBe(201);
    expect(response.body.token).toMatch(/^share_/);
    expect(response.body.ttl).toBe(1800);
    expect(response.body.hasPassword).toBe(true);

    const links = await shareRepo.find({ where: { fileId: file.id } });
    expect(links).toHaveLength(1);
    const savedLink = links[0];
    expect(savedLink.password).not.toBeNull();
    const matches = await bcrypt.compare('secret123', savedLink.password ?? '');
    expect(matches).toBe(true);
  });

  it('allows public access to share links and increments access counts', async () => {
    const fileRepo = dataSource.getRepository(FileEntity);
    const shareRepo = dataSource.getRepository(ShareLinkEntity);

    const file = await fileRepo.save(
      fileRepo.create({
        name: 'video.mp4',
        customName: null,
        key: 'video-key',
        mime: 'video/mp4',
        size: 4096,
        metadata: null,
      })
    );

    const share = await shareRepo.save(
      shareRepo.create({
        token: 'share_access_token',
        fileId: file.id,
        file,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        password: await bcrypt.hash('open-sesame', 10),
        isActive: true,
        accessCount: 0,
      })
    );

    storageStub.getDownloadUrl.mockResolvedValueOnce('https://cdn.example.com/video');

    const response = await request(app)
      .get(`/share/${share.token}`)
      .query({ password: 'open-sesame' });

    expect(response.status).toBe(200);
    expect(response.body.downloadUrl).toBe('https://cdn.example.com/video');

    const updated = await shareRepo.findOne({ where: { token: share.token } });
    expect(updated?.accessCount).toBe(1);
  });

  it('revokes share links through the protected DELETE endpoint', async () => {
    const fileRepo = dataSource.getRepository(FileEntity);
    const shareRepo = dataSource.getRepository(ShareLinkEntity);

    const file = await fileRepo.save(
      fileRepo.create({
        name: 'notes.txt',
        customName: null,
        key: 'notes-key',
        mime: 'text/plain',
        size: 256,
        metadata: null,
      })
    );

    const share = await shareRepo.save(
      shareRepo.create({
        token: 'share_revoke_token',
        fileId: file.id,
        file,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        password: null,
        isActive: true,
        accessCount: 0,
      })
    );

    const response = await request(app).delete(`/share/${share.token}`).set('X-API-Key', apiKey);

    expect(response.status).toBe(200);
    const updated = await shareRepo.findOne({ where: { token: share.token } });
    expect(updated?.isActive).toBe(false);
  });
});
