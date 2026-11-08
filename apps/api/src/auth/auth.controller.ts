import { All, Controller, Req, Res } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @All(['', '*'])
  async handleAuth(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const headers = fromNodeHeaders(req.headers);
    const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
    let body: string | undefined;
    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD' &&
      req.body !== undefined
    ) {
      if (
        headers
          .get('content-type')
          ?.startsWith('application/x-www-form-urlencoded')
      ) {
        body = new URLSearchParams(
          req.body as Record<string, string>,
        ).toString();
      } else {
        body =
          typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }
    headers.delete('content-length');
    const response = await this.authService.auth.handler(
      new Request(url, { method: req.method, headers, body }),
    );
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.header(key, value);
    });
    // Cookies must remain separate headers, including values containing commas.
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.header('set-cookie', cookies);
    return res.send(
      response.body ? Buffer.from(await response.arrayBuffer()) : undefined,
    );
  }
}
