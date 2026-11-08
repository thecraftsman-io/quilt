import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV');
        const isProd = nodeEnv === 'production';
        const isTest = nodeEnv === 'test';
        const configuredLevel = config.get<string>('LOG_LEVEL');
        const level =
          configuredLevel ?? (isTest ? 'silent' : isProd ? 'info' : 'debug');

        return {
          pinoHttp: {
            level,
            genReqId: (req) => {
              const headerId = req.headers['x-request-id'];
              if (typeof headerId === 'string' && headerId.length > 0) {
                return headerId;
              }
              return randomUUID();
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["set-cookie"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.token',
                'req.body.secret',
              ],
              censor: '[REDACTED]',
            },
            transport:
              !isProd && !isTest
                ? {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      singleLine: true,
                      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
            customProps: () => ({
              context: 'HTTP',
            }),
            customLogLevel: (_req, res, err) => {
              if (res.statusCode >= 500 || err) {
                return 'error';
              }
              if (res.statusCode >= 400) {
                return 'warn';
              }
              return 'info';
            },
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
