import 'reflect-metadata';
import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AuthController as ControllerType } from '../src/auth/auth.controller';
import type { AuthService as ServiceType } from '../src/auth/auth.service';

// Exercise Nest's compiled decorator metadata and the real Fastify route/parser.
const require = createRequire(import.meta.url);
const { AuthController } = require('../dist/auth/auth.controller.js') as {
  AuthController: typeof ControllerType;
};
const { AuthService } = require('../dist/auth/auth.service.js') as {
  AuthService: typeof ServiceType;
};
const handler = vi.fn<(request: Request) => Promise<Response>>();

describe('Fastify auth integration', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    class TestModule {}
    Module({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { auth: { handler } } }],
    })(TestModule);
    app = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => {
    handler.mockReset();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('forwards parsed JSON, query parameters, and authentication headers', async () => {
    handler.mockImplementation(async (request) => {
      expect(request.url).toBe(
        'http://localhost/api/auth/sign-in/email?source=mobile',
      );
      expect(request.headers.get('cookie')).toBe('session=example');
      expect(await request.json()).toEqual({
        email: 'person@example.com',
        password: 'test-only',
      });
      return Response.json({ accepted: true }, { status: 201 });
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email?source=mobile',
      headers: { host: 'localhost', cookie: 'session=example' },
      payload: { email: 'person@example.com', password: 'test-only' },
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ accepted: true });
  });

  it('preserves redirect responses and separate Set-Cookie headers', async () => {
    const headers = new Headers({ location: '/signed-in' });
    headers.append(
      'set-cookie',
      'session=abc; Path=/; HttpOnly; Expires=Wed, 21 Oct 2037 07:28:00 GMT',
    );
    headers.append('set-cookie', 'state=; Path=/; Max-Age=0');
    handler.mockResolvedValue(new Response(null, { status: 302, headers }));
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback/google?code=test',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/signed-in');
    expect(response.headers['set-cookie']).toEqual(headers.getSetCookie());
  });

  it('forwards URL-encoded callback bodies', async () => {
    handler.mockImplementation(async (request) => {
      expect(await request.text()).toBe('code=a%2Bb&state=example');
      return Response.json({ ok: true });
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/callback/provider',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'code=a%2Bb&state=example',
    });
    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('preserves auth failures and binary response bodies', async () => {
    handler.mockResolvedValue(
      new Response(new Uint8Array([0, 128, 255]), {
        status: 401,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
    });
    expect(response.statusCode).toBe(401);
    expect(response.rawPayload).toEqual(Buffer.from([0, 128, 255]));
  });

  it('also mounts the bare auth path', async () => {
    handler.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await app.inject({ method: 'GET', url: '/api/auth' });
    expect(response.statusCode).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
    expect(response.body).toBe('');
  });
});
