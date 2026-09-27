"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const duplicate_parameter_guard_1 = require("./duplicate-parameter.guard");
describe('duplicate parameter and prototype protection', () => {
    it('rejects duplicate query parameters', () => {
        expect(() => (0, duplicate_parameter_guard_1.rejectDuplicateQueryParameters)('/?id=1&id=2')).toThrow(duplicate_parameter_guard_1.SecurityValidationError);
    });
    it('rejects duplicate JSON keys', () => {
        expect(() => (0, duplicate_parameter_guard_1.rejectDuplicateJsonKeys)('{"name":"A","name":"B"}')).toThrow(duplicate_parameter_guard_1.SecurityValidationError);
    });
    it('rejects prototype pollution keys recursively', () => {
        expect(() => (0, duplicate_parameter_guard_1.rejectPrototypePollutionObject)({ __proto__: { admin: true } })).toThrow(duplicate_parameter_guard_1.SecurityValidationError);
        expect(() => (0, duplicate_parameter_guard_1.rejectPrototypePollutionObject)({ constructor: { prototype: { admin: true } } })).toThrow(duplicate_parameter_guard_1.SecurityValidationError);
    });
});
//# sourceMappingURL=duplicate-params.spec.js.map