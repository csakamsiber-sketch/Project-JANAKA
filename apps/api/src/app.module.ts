import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ApplicationsController } from './applications/applications.controller';
import { ApplicationsService } from './applications/applications.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { MeetingRequestsController } from './meetings/meeting-requests.controller';
import { MeetingRequestsService } from './meetings/meeting-requests.service';
import { CtiController } from './cti/cti.controller';
import { CtiService } from './cti/cti.service';
import { FindingsController } from './findings/findings.controller';
import { FindingsScheduler } from './findings/findings.scheduler';
import { FindingsService } from './findings/findings.service';
import { LibrariesController } from './libraries/libraries.controller';
import { LibrariesService } from './libraries/libraries.service';
import { PrismaService } from './prisma.service';
import { SupabaseService } from './supabase/supabase.service';
import { RateLimitMiddleware } from './security/rate-limit.middleware';
import { CSRFGuard } from './security/csrf.guard';
import { AuthenticationMiddleware } from './security/authentication.middleware';
import { MailService } from './auth/mail.service';
import { BotProtectionService } from './security/bot-protection.service';
import { DependencyDetectorService } from './applications/dependency-detector.service';
import { RedisSessionService } from './auth/redis-session.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { MasterDataSyncService } from './sync/master-data-sync.service';
import { ErrorLoggerService } from './security/error-logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env', '.env.local', 'apps/api/.env.local'],
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    ApplicationsController,
    DashboardController,
    MeetingRequestsController,
    CtiController,
    FindingsController,
    LibrariesController,
    SyncController,
  ],
  providers: [
    AppService,
    AuthService,
    ApplicationsService,
    DashboardService,
    MeetingRequestsService,
    CtiService,
    FindingsService,
    FindingsScheduler,
    LibrariesService,
    PrismaService,
    SupabaseService,
    AuthenticationMiddleware,
    MailService,
    BotProtectionService,
    DependencyDetectorService,
    RedisSessionService,
    SyncService,
    MasterDataSyncService,
    ErrorLoggerService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware, CSRFGuard, AuthenticationMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
