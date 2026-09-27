import { VerificationPeriodEntity } from './verification-period.entity';
export declare class VerificationPeriodService {
    private readonly periods;
    createPeriod(input: Omit<VerificationPeriodEntity, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
    }): VerificationPeriodEntity;
    listPeriods(): VerificationPeriodEntity[];
    getPeriod(id: string): VerificationPeriodEntity | undefined;
}
