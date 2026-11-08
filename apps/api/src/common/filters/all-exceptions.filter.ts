import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiErrorResponse, ValidationErrorIssue } from '@quilt/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId =
      (typeof request.id === 'string' && request.id) ||
      (typeof request.headers['x-request-id'] === 'string' &&
        request.headers['x-request-id']) ||
      undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let errors: ValidationErrorIssue[] | undefined;
    let currentVersion: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.statusToCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const payload = res as Record<string, unknown>;
        if (
          status === 409 &&
          typeof payload.currentVersion === 'number' &&
          Number.isSafeInteger(payload.currentVersion) &&
          payload.currentVersion > 0
        )
          currentVersion = payload.currentVersion;
        if (typeof payload.message === 'string') {
          message = payload.message;
        } else if (Array.isArray(payload.message)) {
          message = payload.message.join('; ');
        }

        if (typeof payload.code === 'string') {
          code = payload.code;
        } else {
          code = this.statusToCode(status);
        }

        if (Array.isArray(payload.errors)) {
          errors = payload.errors as ValidationErrorIssue[];
        }
      }
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'Validation failed';
      errors = exception.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      }));
    } else if (exception instanceof Error) {
      const isProd = this.config.get<string>('NODE_ENV') === 'production';
      message = isProd ? 'Internal server error' : exception.message;
      code = 'INTERNAL_SERVER_ERROR';
    }

    const errorResponse: ApiErrorResponse = {
      statusCode: status,
      code,
      message,
      ...(errors && errors.length > 0 ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
      ...(currentVersion !== undefined ? { currentVersion } : {}),
    };

    if (status >= 500) {
      this.logger.error(
        {
          err: exception,
          requestId,
          url: request.url,
          method: request.method,
          statusCode: status,
        },
        `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      );
    } else {
      this.logger.warn(
        {
          requestId,
          url: request.url,
          method: request.method,
          statusCode: status,
          code,
        },
        `HTTP ${status} [${code}]: ${message}`,
      );
    }

    if (requestId) {
      response.header('x-request-id', requestId);
    }

    response.status(status).send(errorResponse);
  }

  private statusToCode(status: number): string {
    const codes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    };
    return (
      codes[status] ?? (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR')
    );
  }
}
