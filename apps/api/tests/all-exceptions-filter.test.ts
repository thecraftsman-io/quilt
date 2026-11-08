import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  function createHost(requestOverrides = {}, replyOverrides = {}) {
    const sentData: {
      status?: number;
      payload?: unknown;
      headers: Record<string, string>;
    } = {
      headers: {},
    };

    const request = {
      url: '/api/test',
      method: 'GET',
      headers: {},
      ...requestOverrides,
    } as unknown as FastifyRequest;

    const reply = {
      status: vi.fn((statusCode: number) => {
        sentData.status = statusCode;
        return reply;
      }),
      send: vi.fn((payload: unknown) => {
        sentData.payload = payload;
        return reply;
      }),
      header: vi.fn((name: string, value: string) => {
        sentData.headers[name] = value;
        return reply;
      }),
      ...replyOverrides,
    } as unknown as FastifyReply;

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => reply,
      }),
    };

    return { host: host as never, sentData, reply };
  }

  function createFilter(nodeEnv = 'test') {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    } as unknown as Logger;

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
    } as unknown as ConfigService;

    const filter = new AllExceptionsFilter(logger, config);
    return { filter, logger, config };
  }

  it('formats standard HttpException cleanly with status and code', () => {
    const { filter, logger } = createFilter();
    const { host, sentData, reply } = createHost({
      headers: { 'x-request-id': 'req-abc-123' },
    });

    filter.catch(new NotFoundException('Household not found'), host);

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(reply.header).toHaveBeenCalledWith('x-request-id', 'req-abc-123');
    expect(sentData.payload).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Household not found',
      path: '/api/test',
      requestId: 'req-abc-123',
    });
    expect(typeof (sentData.payload as { timestamp: string }).timestamp).toBe(
      'string',
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('preserves validated version-conflict metadata for finance clients', () => {
    const { filter } = createFilter();
    const { host, sentData } = createHost();
    filter.catch(
      new ConflictException({
        message: 'Reload before editing.',
        currentVersion: 7,
      }),
      host,
    );
    expect(sentData.payload).toMatchObject({
      statusCode: 409,
      currentVersion: 7,
    });
  });

  it('formats BadRequestException with validation errors and custom code', () => {
    const { filter } = createFilter();
    const { host, sentData } = createHost();

    const exception = new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [{ path: ['email'], message: 'Invalid email' }],
    });

    filter.catch(exception, host);

    expect(sentData.payload).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [{ path: ['email'], message: 'Invalid email' }],
    });
  });

  it('formats ZodError directly into a structured validation error response', () => {
    const { filter } = createFilter();
    const { host, sentData } = createHost();

    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ]);

    filter.catch(zodError, host);

    expect(sentData.payload).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [{ path: ['name'], message: 'Expected string, received number' }],
    });
  });

  it('sanitizes unexpected 500 errors in production', () => {
    const { filter, logger } = createFilter('production');
    const { host, sentData } = createHost();

    filter.catch(
      new Error('Sensitive database credentials connection timeout'),
      host,
    );

    expect(sentData.payload).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('exposes internal error messages in non-production environments', () => {
    const { filter, logger } = createFilter('development');
    const { host, sentData } = createHost();

    filter.catch(new Error('Detailed debug information for developer'), host);

    expect(sentData.payload).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Detailed debug information for developer',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
