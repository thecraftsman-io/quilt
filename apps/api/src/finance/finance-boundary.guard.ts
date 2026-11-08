import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class FinanceBoundaryGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    http.getResponse<FastifyReply>().header('cache-control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const allowed = [
        ...this.config.getOrThrow<string[]>('CORS_ORIGIN_LIST'),
        new URL(this.config.getOrThrow<string>('BETTER_AUTH_URL')).origin,
        'quilt://',
      ];
      // Native clients may omit Origin. Browsers must use an approved origin;
      // CORS alone does not prevent cross-site write requests.
      if (
        (origin && !allowed.includes(origin)) ||
        (!origin && request.headers['sec-fetch-site'] === 'cross-site')
      )
        throw new ForbiddenException('Request origin is not allowed.');
    }
    return true;
  }
}
