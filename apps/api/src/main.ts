import { createApiApplication } from './app.factory';
import { ConfigService } from '@nestjs/config';
import { ErrorLoggerService } from './security/error-logger.service';

async function bootstrap() {
  const app = await createApiApplication();
  const logger = app.get(ErrorLoggerService);
  const configService = app.get(ConfigService);
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

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
