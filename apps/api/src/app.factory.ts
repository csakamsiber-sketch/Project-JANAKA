import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
const cookiePlugin = require('@fastify/cookie') as any;
import { HttpExceptionFilter } from './security/http-exception.filter';
import { RequestIdMiddleware } from './security/request-id.middleware';
import { SecurityHeadersMiddleware } from './security/security-headers.middleware';
import { ZodValidationPipe } from './security/zod-validation.pipe';
import { ValidationExceptionFilter } from './security/validation-exception.filter';
import { SecurityLoggingInterceptor } from './security/security-logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorLoggerService } from './security/error-logger.service';
import { getAllowedOrigins } from './security/request-origin';

function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const required = [
    'DATABASE_URL',
    'DIRECT_URL',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'REDIS_URL',
    'JWT_SECRET',
    'FINGERPRINT_PEPPER',
    'COOKIE_SECRET',
    'TURNSTILE_SECRET_KEY',
    'CRON_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (process.env.VERCEL && process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('rediss://')) {
    missing.push('REDIS_URL (must use rediss:// on Vercel)');
  }
  if (missing.length) throw new Error(`Missing or invalid production environment variables: ${missing.join(', ')}.`);
}

export async function createApiApplication(): Promise<NestFastifyApplication> {
  validateProductionEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    logger: false,
    trustProxy: true,
    maxParamLength: 1024,
    bodyLimit: 25 * 1024 * 1024,
  }));

  const logger = app.get(ErrorLoggerService);
  await app.register(cookiePlugin, {
    secret: process.env.COOKIE_SECRET ?? 'janus-cookie-secret',
    parseOptions: {},
  });

  app.use(RequestIdMiddleware);
  app.use(SecurityHeadersMiddleware);
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter(logger), new ValidationExceptionFilter(logger));
  app.useGlobalInterceptors(new SecurityLoggingInterceptor(logger));
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-Fingerprint'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('JAMUS KALIMASADA API')
    .setDescription('Security assurance and CTI platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  return app;
}