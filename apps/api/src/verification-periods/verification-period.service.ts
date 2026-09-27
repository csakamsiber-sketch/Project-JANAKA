import { VerificationPeriodEntity } from './verification-period.entity';

export class VerificationPeriodService {
  private readonly periods = new Map<string, VerificationPeriodEntity>();

  createPeriod(input: Omit<VerificationPeriodEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): VerificationPeriodEntity {
    const now = new Date();
    const period: VerificationPeriodEntity = {
      id: input.id ?? crypto.randomUUID(),
      applicationId: input.applicationId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      scope: input.scope,
      assignedVerificatorId: input.assignedVerificatorId,
      createdAt: now,
      updatedAt: now,
    };

    this.periods.set(period.id, period);
    return period;
  }

  listPeriods(): VerificationPeriodEntity[] {
    return Array.from(this.periods.values());
  }

  getPeriod(id: string): VerificationPeriodEntity | undefined {
    return this.periods.get(id);
  }
}
