"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_controller_1 = require("./auth/auth.controller");
const auth_service_1 = require("./auth/auth.service");
const applications_controller_1 = require("./applications/applications.controller");
const applications_service_1 = require("./applications/applications.service");
const dashboard_controller_1 = require("./dashboard/dashboard.controller");
const dashboard_service_1 = require("./dashboard/dashboard.service");
const meeting_requests_controller_1 = require("./meetings/meeting-requests.controller");
const meeting_requests_service_1 = require("./meetings/meeting-requests.service");
const cti_controller_1 = require("./cti/cti.controller");
const cti_service_1 = require("./cti/cti.service");
const findings_controller_1 = require("./findings/findings.controller");
const findings_scheduler_1 = require("./findings/findings.scheduler");
const findings_service_1 = require("./findings/findings.service");
const libraries_controller_1 = require("./libraries/libraries.controller");
const libraries_service_1 = require("./libraries/libraries.service");
const prisma_service_1 = require("./prisma.service");
const supabase_service_1 = require("./supabase/supabase.service");
const rate_limit_middleware_1 = require("./security/rate-limit.middleware");
const csrf_guard_1 = require("./security/csrf.guard");
const authentication_middleware_1 = require("./security/authentication.middleware");
const mail_service_1 = require("./auth/mail.service");
const bot_protection_service_1 = require("./security/bot-protection.service");
const dependency_detector_service_1 = require("./applications/dependency-detector.service");
const redis_session_service_1 = require("./auth/redis-session.service");
const sync_controller_1 = require("./sync/sync.controller");
const sync_service_1 = require("./sync/sync.service");
const master_data_sync_service_1 = require("./sync/master-data-sync.service");
const error_logger_service_1 = require("./security/error-logger.service");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(rate_limit_middleware_1.RateLimitMiddleware, csrf_guard_1.CSRFGuard, authentication_middleware_1.AuthenticationMiddleware).forRoutes({ path: '{*path}', method: common_1.RequestMethod.ALL });
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', 'apps/api/.env', '.env.local', 'apps/api/.env.local'],
            }),
        ],
        controllers: [
            app_controller_1.AppController,
            auth_controller_1.AuthController,
            applications_controller_1.ApplicationsController,
            dashboard_controller_1.DashboardController,
            meeting_requests_controller_1.MeetingRequestsController,
            cti_controller_1.CtiController,
            findings_controller_1.FindingsController,
            libraries_controller_1.LibrariesController,
            sync_controller_1.SyncController,
        ],
        providers: [
            app_service_1.AppService,
            auth_service_1.AuthService,
            applications_service_1.ApplicationsService,
            dashboard_service_1.DashboardService,
            meeting_requests_service_1.MeetingRequestsService,
            cti_service_1.CtiService,
            findings_service_1.FindingsService,
            findings_scheduler_1.FindingsScheduler,
            libraries_service_1.LibrariesService,
            prisma_service_1.PrismaService,
            supabase_service_1.SupabaseService,
            authentication_middleware_1.AuthenticationMiddleware,
            mail_service_1.MailService,
            bot_protection_service_1.BotProtectionService,
            dependency_detector_service_1.DependencyDetectorService,
            redis_session_service_1.RedisSessionService,
            sync_service_1.SyncService,
            master_data_sync_service_1.MasterDataSyncService,
            error_logger_service_1.ErrorLoggerService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map