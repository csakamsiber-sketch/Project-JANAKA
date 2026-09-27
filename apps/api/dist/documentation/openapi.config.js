"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openApiConfig = void 0;
const swagger_1 = require("@nestjs/swagger");
exports.openApiConfig = new swagger_1.DocumentBuilder()
    .setTitle('JAMUS KALIMASADA API')
    .setDescription('Security assurance, verification, and CTI platform API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
//# sourceMappingURL=openapi.config.js.map