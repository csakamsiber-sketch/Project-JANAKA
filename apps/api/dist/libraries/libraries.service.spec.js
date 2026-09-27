"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
const libraries_service_1 = require("./libraries.service");
describe('LibrariesService', () => {
    it('correlates only critical vulnerabilities by threshold', () => {
        const result = libraries_service_1.LibrariesService.correlateVulnerabilities([
            {
                name: 'lodash',
                version: '4.17.20',
                ecosystem: 'npm',
                vulnerabilities: [
                    { id: 'CVE-1', library: 'lodash', version: '4.17.20', severity: 'MEDIUM', summary: 'prototype pollution' },
                    { id: 'CVE-2', library: 'lodash', version: '4.17.20', severity: 'CRITICAL', summary: 'RCE', fixedVersion: '4.17.21' },
                ],
            },
        ], 'HIGH');
        expect(result).toHaveLength(1);
        const item = result[0];
        expect(item.severity).toBe('CRITICAL');
    });
    it('builds a remediation list from fixed versions', () => {
        const fixes = libraries_service_1.LibrariesService.buildRecommendedRemediation([
            { id: 'CVE-3', library: 'axios', version: '0.21.0', severity: 'HIGH', summary: 'ssrf', fixedVersion: '0.21.1' },
            { id: 'CVE-4', library: 'axios', version: '0.21.0', severity: 'HIGH', summary: 'ssrf', fixedVersion: '0.21.1' },
        ]);
        expect(fixes).toEqual(['axios -> 0.21.1']);
    });
});
//# sourceMappingURL=libraries.service.spec.js.map