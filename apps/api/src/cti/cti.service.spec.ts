import { CtiService, type ThreatIntelRecord } from './cti.service';

describe('CtiService', () => {
  it('deduplicates threat intel records by id', () => {
    const input: ThreatIntelRecord[] = [
      { id: 'ADV-1', title: 'A', source: 'NVD', severity: 'HIGH', summary: 'X', affectedComponent: 'app', publishedAt: '2024-01-01' },
      { id: 'ADV-1', title: 'A', source: 'NVD', severity: 'HIGH', summary: 'X', affectedComponent: 'app', publishedAt: '2024-01-01' },
      { id: 'ADV-2', title: 'B', source: 'GHSA', severity: 'CRITICAL', summary: 'Y', affectedComponent: 'lib', publishedAt: '2024-01-02' },
    ];

    expect(CtiService.deduplicate(input)).toHaveLength(2);
  });

  it('prioritizes higher severity records first', () => {
    const prioritized = CtiService.prioritize([
      { id: 'A', title: 'Low', source: 'OSV', severity: 'LOW', summary: 'L', affectedComponent: 'x', publishedAt: '2024-01-01' },
      { id: 'B', title: 'Critical', source: 'NVD', severity: 'CRITICAL', summary: 'C', affectedComponent: 'y', publishedAt: '2024-01-02' },
    ] as ThreatIntelRecord[]);

    expect(prioritized[0]!).toBeDefined();
    expect(prioritized[0]!.id).toBe('B');
  });
});
