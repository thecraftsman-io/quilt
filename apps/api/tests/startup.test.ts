import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

describe('API Startup', () => {
  it(
    'the compiled API entry boots and serves health',
    { timeout: 45000 },
    async () => {
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const address = reservation.address();
      const port = typeof address === 'object' && address ? address.port : 3000;
      await new Promise((done) => reservation.close(done));

      const child = spawn(
        process.execPath,
        [resolve(__dirname, '../dist/main.js')],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            PORT: String(port),
            DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
            BETTER_AUTH_SECRET:
              'test-only-startup-secret-at-least-32-characters',
            BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
            APP_URL: 'http://localhost:8081',
            NODE_ENV: 'test',
            CORS_ORIGINS: 'http://localhost:8081',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output = (output + data.toString()).slice(-3000);
      });
      child.stderr.on('data', (data: Buffer) => {
        output = (output + data.toString()).slice(-3000);
      });

      try {
        let response: Response | undefined;
        for (let attempt = 0; attempt < 200; attempt++) {
          if (child.exitCode !== null) break;
          try {
            response = await fetch(`http://127.0.0.1:${port}/api/health`, {
              signal: AbortSignal.timeout(500),
            });
            if (response.ok) break;
          } catch {
            /* Wait for startup, bounded by this test's timeout. */
          }
          await delay(100);
        }
        expect(response?.ok, `Compiled API failed to start:\n${output}`).toBe(
          true,
        );
        expect(await response?.json()).toEqual({
          status: 'ok',
          service: 'quilt-api',
        });
        const preflight = await fetch(
          `http://127.0.0.1:${port}/api/organizations`,
          {
            method: 'OPTIONS',
            signal: AbortSignal.timeout(1000),
            headers: {
              Origin: 'http://localhost:8081',
              'Access-Control-Request-Method': 'PATCH',
            },
          },
        );
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe(
          'http://localhost:8081',
        );
        expect(preflight.headers.get('access-control-allow-credentials')).toBe(
          'true',
        );
        expect(preflight.headers.get('access-control-allow-methods')).toContain(
          'PATCH',
        );
      } finally {
        if (child.exitCode === null) {
          child.kill();
          await delay(100);
        }
      }
    },
  );
});
