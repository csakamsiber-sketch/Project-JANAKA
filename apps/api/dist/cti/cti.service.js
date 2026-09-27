"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CtiService = void 0;
class CtiService {
    static validateRecord(record) {
        if (!record || typeof record !== 'object')
            return false;
        if (!record.id || !record.title || !record.source || !record.summary)
            return false;
        if (!record.affectedComponent || !record.publishedAt)
            return false;
        return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(record.severity ?? 'LOW');
    }
    static deduplicate(records) {
        const seen = new Set();
        return (records ?? []).filter((record) => {
            if (!this.validateRecord(record))
                return false;
            if (seen.has(record.id))
                return false;
            seen.add(record.id);
            return true;
        });
    }
    static prioritize(records) {
        const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        return [...(records ?? [])].sort((a, b) => order.indexOf(b.severity) - order.indexOf(a.severity));
    }
}
exports.CtiService = CtiService;
//# sourceMappingURL=cti.service.js.map