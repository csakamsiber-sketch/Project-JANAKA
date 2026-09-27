import {
  rejectDuplicateJsonKeys,
  rejectDuplicateQueryParameters,
  rejectPrototypePollutionObject,
  SecurityValidationError,
} from './duplicate-parameter.guard';

describe('duplicate parameter and prototype protection', () => {
  it('rejects duplicate query parameters', () => {
    expect(() => rejectDuplicateQueryParameters('/?id=1&id=2')).toThrow(SecurityValidationError);
  });

  it('rejects duplicate JSON keys', () => {
    expect(() => rejectDuplicateJsonKeys('{"name":"A","name":"B"}')).toThrow(SecurityValidationError);
  });

  it('rejects prototype pollution keys recursively', () => {
    expect(() => rejectPrototypePollutionObject({ __proto__: { admin: true } })).toThrow(SecurityValidationError);
    expect(() => rejectPrototypePollutionObject({ constructor: { prototype: { admin: true } } })).toThrow(SecurityValidationError);
  });
});
