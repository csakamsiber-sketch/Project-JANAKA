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

export class CtiService {
  static validateRecord(record: Partial<ThreatIntelRecord>): boolean {
    if (!record || typeof record !== 'object') return false;
    if (!record.id || !record.title || !record.source || !record.summary) return false;
    if (!record.affectedComponent || !record.publishedAt) return false;
    return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(record.severity ?? 'LOW');
  }

  static deduplicate(records: ThreatIntelRecord[]): ThreatIntelRecord[] {
    const seen = new Set<string>();
    return (records ?? []).filter((record) => {
      if (!this.validateRecord(record)) return false;
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
  }

  static prioritize(records: ThreatIntelRecord[]): ThreatIntelRecord[] {
    const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return [...(records ?? [])].sort(
      (a, b) => order.indexOf(b.severity) - order.indexOf(a.severity),
    );
  }
}
