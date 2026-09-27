"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const app_module_1 = require("./app.module");
const cookiePlugin = require('@fastify/cookie');
const http_exception_filter_1 = require("./security/http-exception.filter");
const request_id_middleware_1 = require("./security/request-id.middleware");
const security_headers_middleware_1 = require("./security/security-headers.middleware");
const zod_validation_pipe_1 = require("./security/zod-validation.pipe");
const validation_exception_filter_1 = require("./security/validation-exception.filter");
const security_logging_interceptor_1 = require("./security/security-logging.interceptor");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const error_logger_service_1 = require("./security/error-logger.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({
        logger: false,
        trustProxy: true,
        maxParamLength: 1024,
        bodyLimit: 25 * 1024 * 1024,
    }));
    const logger = app.get(error_logger_service_1.ErrorLoggerService);
    await app.register(cookiePlugin, {
        secret: process.env.COOKIE_SECRET ?? 'janus-cookie-secret',
        parseOptions: {},
    });
    const configService = app.get(config_1.ConfigService);
    const allowedOrigins = (configService.get('CORS_ALLOWED_ORIGINS') ?? 'http://localhost:3000,http://localhost:3110,http://127.0.0.1:3000,http://127.0.0.1:3110,https://project-janaka-web.vercel.app')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.use(request_id_middleware_1.RequestIdMiddleware);
    app.use(security_headers_middleware_1.SecurityHeadersMiddleware);
    app.useGlobalPipes(new zod_validation_pipe_1.ZodValidationPipe());
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter(logger), new validation_exception_filter_1.ValidationExceptionFilter(logger));
    app.useGlobalInterceptors(new security_logging_interceptor_1.SecurityLoggingInterceptor(logger));
    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-Fingerprint'],
        exposedHeaders: ['X-Request-Id'],
    });
    app.setGlobalPrefix('api/v1');
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('JAMUS KALIMASADA API')
        .setDescription('Security assurance and CTI platform API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
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
    const port = configService.get('PORT', 4000);
    await app.listen(port, '0.0.0.0');
}
bootstrap();
//# sourceMappingURL=main.js.map