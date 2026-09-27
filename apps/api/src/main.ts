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
import { ConfigService } from '@nestjs/config';
import { ErrorLoggerService } from './security/error-logger.service';

export async function createApplication(): Promise<NestFastifyApplication> {
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

  const configService = app.get(ConfigService);
  const allowedOrigins = (configService.get<string>('CORS_ALLOWED_ORIGINS') ?? 'http://localhost:3000,http://localhost:3110,http://127.0.0.1:3000,http://127.0.0.1:3110,https://project-janaka-web.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(RequestIdMiddleware);
  app.use(SecurityHeadersMiddleware);

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter(logger), new ValidationExceptionFilter(logger));
  app.useGlobalInterceptors(new SecurityLoggingInterceptor(logger));

  app.enableCors({
    origin: allowedOrigins,
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

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const requestId = 'system';
    logger.log({
      event: 'unhandled_rejection',
      requestId,
      method: 'SYSTEM',
      path: 'global',
      errorCode: 'UNHANDLED_REJECTION',
      errorType: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  });

  process.on('uncaughtException', (error) => {
    logger.log({
      event: 'unhandled_exception',
      requestId: 'system',
      method: 'SYSTEM',
      path: 'global',
      errorCode: 'UNCAUGHT_EXCEPTION',
      errorType: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  });

  await app.init();
  return app;
}

async function bootstrap() {
  const app = await createApplication();
  const port = app.get(ConfigService).get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
