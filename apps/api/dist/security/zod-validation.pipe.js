"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodValidationPipe = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
let ZodValidationPipe = class ZodValidationPipe {
    transform(value, _metadata) {
        if (value === undefined || value === null) {
            return value;
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            return value;
        }
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(1).optional(),
            email: zod_1.z.string().email().optional(),
            password: zod_1.z.string().min(12).max(128).optional(),
            fingerprint: zod_1.z.string().min(8).max(256).optional(),
            role: zod_1.z.string().optional(),
            id: zod_1.z.string().optional(),
            amount: zod_1.z.number().optional(),
            data: zod_1.z.unknown().optional(),
            firstName: zod_1.z.string().min(2).max(80).optional(),
            lastName: zod_1.z.string().min(2).max(80).optional(),
            otp: zod_1.z.string().min(6).max(8).optional(),
            challengeId: zod_1.z.string().uuid().optional(),
            temporaryAccessToken: zod_1.z.string().length(64).optional(),
            botToken: zod_1.z.string().min(1).optional(),
            token: zod_1.z.string().min(16).max(256).optional(),
        }).passthrough();
        try {
            const parsed = schema.parse(value);
            return parsed;
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                throw new common_1.BadRequestException({ message: 'Request validation failed.', issues: error.issues });
            }
            throw new common_1.BadRequestException('Request validation failed.');
        }
    }
};
exports.ZodValidationPipe = ZodValidationPipe;
exports.ZodValidationPipe = ZodValidationPipe = __decorate([
    (0, common_1.Injectable)()
], ZodValidationPipe);
//# sourceMappingURL=zod-validation.pipe.js.map