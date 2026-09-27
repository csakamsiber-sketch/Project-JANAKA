"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMiddleware = void 0;
const common_1 = require("@nestjs/common");
const duplicate_parameter_guard_1 = require("./duplicate-parameter.guard");
let SecurityMiddleware = class SecurityMiddleware {
    use(req, _res, next) {
        const rawUrl = req.originalUrl ?? req.url ?? '';
        try {
            (0, duplicate_parameter_guard_1.rejectDuplicateQueryParameters)(rawUrl);
        }
        catch (error) {
            throw new common_1.BadRequestException('Duplicate query parameters are not allowed.');
        }
        if (req.body !== undefined) {
            try {
                (0, duplicate_parameter_guard_1.rejectPrototypePollutionObject)(req.body);
                if (typeof req.body === 'string') {
                    (0, duplicate_parameter_guard_1.rejectDuplicateJsonKeys)(req.body);
                }
            }
            catch (error) {
                throw new common_1.BadRequestException('Unsafe request content detected.');
            }
        }
        next();
    }
};
exports.SecurityMiddleware = SecurityMiddleware;
exports.SecurityMiddleware = SecurityMiddleware = __decorate([
    (0, common_1.Injectable)()
], SecurityMiddleware);
//# sourceMappingURL=security.middleware.js.map