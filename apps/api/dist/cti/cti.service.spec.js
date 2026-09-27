"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cti_service_1 = require("./cti.service");
describe('CtiService', () => {
    it('deduplicates threat intel records by id', () => {
        const input = [
            { id: 'ADV-1', title: 'A', source: 'NVD', severity: 'HIGH', summary: 'X', affectedComponent: 'app', publishedAt: '2024-01-01' },
            { id: 'ADV-1', title: 'A', source: 'NVD', severity: 'HIGH', summary: 'X', affectedComponent: 'app', publishedAt: '2024-01-01' },
            { id: 'ADV-2', title: 'B', source: 'GHSA', severity: 'CRITICAL', summary: 'Y', affectedComponent: 'lib', publishedAt: '2024-01-02' },
        ];
        expect(cti_service_1.CtiService.deduplicate(input)).toHaveLength(2);
    });
    it('prioritizes higher severity records first', () => {
        const prioritized = cti_service_1.CtiService.prioritize([
            { id: 'A', title: 'Low', source: 'OSV', severity: 'LOW', summary: 'L', affectedComponent: 'x', publishedAt: '2024-01-01' },
            { id: 'B', title: 'Critical', source: 'NVD', severity: 'CRITICAL', summary: 'C', affectedComponent: 'y', publishedAt: '2024-01-02' },
        ]);
        expect(prioritized[0]).toBeDefined();
        expect(prioritized[0].id).toBe('B');
    });
});
//# sourceMappingURL=cti.service.spec.js.map