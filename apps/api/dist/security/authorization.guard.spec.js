"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authorization_guard_1 = require("./authorization.guard");
describe('authorization guard', () => {
    it('allows superadmin access to admin rights', () => {
        expect((0, authorization_guard_1.requirePermission)('SUPERADMIN', 'users.manage')).toBe(true);
    });
    it('denies pic access to system admin rights', () => {
        expect((0, authorization_guard_1.requirePermission)('PIC', 'users.manage')).toBe(false);
    });
    it('allows overseer access to monitoring', () => {
        expect((0, authorization_guard_1.requirePermission)('OVERSEER', 'progress.monitor')).toBe(true);
    });
});
//# sourceMappingURL=authorization.guard.spec.js.map