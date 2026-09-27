export type CtiSource = 'NVD' | 'OSV' | 'GHSA' | 'CUSTOM';
export type ThreatIntelRecord = {
    id: string;
    title: string;
    source: CtiSource;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    summary: string;
    affectedComponent: string;
    publishedAt: string;
};
export declare class CtiService {
    static validateRecord(record: Partial<ThreatIntelRecord>): boolean;
    static deduplicate(records: ThreatIntelRecord[]): ThreatIntelRecord[];
    static prioritize(records: ThreatIntelRecord[]): ThreatIntelRecord[];
}
