"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_factory_1 = require("./app.factory");
const config_1 = require("@nestjs/config");
const error_logger_service_1 = require("./security/error-logger.service");
async function bootstrap() {
    const app = await (0, app_factory_1.createApiApplication)();
    const logger = app.get(error_logger_service_1.ErrorLoggerService);
    const configService = app.get(config_1.ConfigService);
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