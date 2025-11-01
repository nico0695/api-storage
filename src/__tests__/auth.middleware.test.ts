import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import type { DataSource } from 'typeorm';
import { createAuthenticateAPIKeyMiddleware } from '../middleware/auth.middleware.js';
import { APIKeyEntity } from '../entities/APIKeyEntity.js';

type LoggerMock = {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

type FindOneFn = (criteria: unknown) => Promise<APIKeyEntity | null>;

const createMockLogger = (): LoggerMock => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

describe('authenticateAPIKey middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without an API key header', async () => {
    const logger = createMockLogger();
    const dataSource = { getRepository: jest.fn() } as unknown as Pick<DataSource, 'getRepository'>;
    const middleware = createAuthenticateAPIKeyMiddleware({
      dataSource,
      logger: logger as unknown as typeof import('../utils/logger.js').logger,
    });

    const req = { headers: {}, path: '/files' } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'API key required. Provide X-API-Key header.',
    });
    expect(logger.warn).toHaveBeenCalledWith({ path: '/files' }, 'Missing API key');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects inactive or unknown API keys', async () => {
    const logger = createMockLogger();
    const findOneMock = jest
      .fn(async () => null)
      .mockResolvedValue(null) as jest.MockedFunction<FindOneFn>;
    const repo = { findOne: findOneMock };
    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === APIKeyEntity) {
          return repo;
        }
        throw new Error('Unexpected entity');
      }),
    } as unknown as Pick<DataSource, 'getRepository'>;
    const middleware = createAuthenticateAPIKeyMiddleware({
      dataSource,
      logger: logger as unknown as typeof import('../utils/logger.js').logger,
    });

    const req = {
      headers: { 'x-api-key': 'sk_test' },
      path: '/files',
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(findOneMock).toHaveBeenCalledWith({
      where: { key: 'sk_test', isActive: true },
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or inactive API key' });
    expect(logger.warn).toHaveBeenCalledWith(
      { path: '/files', key: 'sk_test'.slice(0, 10) + '...' },
      'Invalid or inactive API key'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches API key metadata and allows the request when key is valid', async () => {
    const logger = createMockLogger();
    const keyRecord = { id: 1, name: 'integration', isActive: true, key: 'sk_valid' };
    const findOneMock = jest
      .fn(async () => keyRecord as APIKeyEntity)
      .mockResolvedValue(keyRecord as APIKeyEntity) as jest.MockedFunction<FindOneFn>;
    const repo = { findOne: findOneMock };
    const dataSource = {
      getRepository: jest.fn().mockImplementation(() => repo),
    } as unknown as Pick<DataSource, 'getRepository'>;
    const middleware = createAuthenticateAPIKeyMiddleware({
      dataSource,
      logger: logger as unknown as typeof import('../utils/logger.js').logger,
    });

    const req = {
      headers: { 'x-api-key': 'sk_valid' },
      path: '/files',
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.apiKey).toEqual({ id: 1, name: 'integration' });
    expect(next).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { consumer: 'integration', path: '/files' },
      'Authenticated request'
    );
  });

  it('returns 500 when the lookup throws unexpectedly', async () => {
    const logger = createMockLogger();
    const findOneMock = jest
      .fn(async () => null)
      .mockRejectedValue(new Error('database down')) as jest.MockedFunction<FindOneFn>;
    const repo = { findOne: findOneMock };
    const dataSource = {
      getRepository: jest.fn().mockImplementation(() => repo),
    } as unknown as Pick<DataSource, 'getRepository'>;
    const middleware = createAuthenticateAPIKeyMiddleware({
      dataSource,
      logger: logger as unknown as typeof import('../utils/logger.js').logger,
    });

    const req = {
      headers: { 'x-api-key': 'sk_valid' },
      path: '/files',
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication error' });
    expect(logger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      'Error validating API key'
    );
  });
});
