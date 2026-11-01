import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { QueueModule } from './infra/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AcademicModule } from './modules/academic/academic.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { GradingModule } from './modules/grading/grading.module';
import { StudentModule } from './modules/student/student.module';
import { FinancialModule } from './modules/financial/financial.module';
import { RegistryModule } from './modules/registry/registry.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ActiveProfileGuard } from './common/guards/active-profile.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    QueueModule,
    HealthModule,
    AuthModule,
    AcademicModule,
    EnrollmentModule,
    GradingModule,
    StudentModule,
    FinancialModule,
    RegistryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ActiveProfileGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
