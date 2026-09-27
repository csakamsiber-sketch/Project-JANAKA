"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityValidationError = void 0;
exports.rejectDuplicateQueryParameters = rejectDuplicateQueryParameters;
exports.rejectDuplicateJsonKeys = rejectDuplicateJsonKeys;
exports.rejectPrototypePollutionObject = rejectPrototypePollutionObject;
class SecurityValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SecurityValidationError';
    }
}
exports.SecurityValidationError = SecurityValidationError;
function rejectDuplicateQueryParameters(rawUrl) {
    const search = rawUrl.split('?')[1];
    if (!search)
        return;
    const seen = new Set();
    const pairs = search.split('&');
    for (const pair of pairs) {
        if (!pair)
            continue;
        let decoded;
        try {
            decoded = decodeURIComponent(pair);
        }
        catch {
            throw new SecurityValidationError('Duplicate query parameters are not allowed.');
        }
        const key = decoded.split('=')[0];
        if (!key)
            continue;
        if (seen.has(key)) {
            throw new SecurityValidationError('Duplicate query parameters are not allowed.');
        }
        seen.add(key);
    }
}
function rejectDuplicateJsonKeys(rawBody) {
    let index = 0;
    const len = rawBody.length;
    const skipWhitespace = () => {
        while (index < len && /\s/.test(rawBody[index] ?? '')) {
            index += 1;
        }
    };
    const expect = (char) => {
        skipWhitespace();
        if (rawBody[index] !== char) {
            throw new SecurityValidationError('Malformed JSON content is not allowed.');
        }
        index += 1;
    };
    const parseString = () => {
        skipWhitespace();
        if (rawBody[index] !== '"') {
            throw new SecurityValidationError('Malformed JSON content is not allowed.');
        }
        index += 1;
        let result = '';
        while (index < len) {
            const current = rawBody[index];
            if (current === '\\') {
                index += 1;
                const escaped = rawBody[index];
                if (escaped === undefined) {
                    throw new SecurityValidationError('Malformed JSON content is not allowed.');
                }
                const map = {
                    '"': '"',
                    '\\': '\\',
                    '/': '/',
                    b: '\b',
                    f: '\f',
                    n: '\n',
                    r: '\r',
                    t: '\t',
                };
                result += map[escaped] ?? escaped;
                index += 1;
                continue;
            }
            if (current === '"') {
                index += 1;
                return result;
            }
            if (current === '\n' || current === '\r') {
                throw new SecurityValidationError('Malformed JSON content is not allowed.');
            }
            result += current;
            index += 1;
        }
        throw new SecurityValidationError('Malformed JSON content is not allowed.');
    };
    const parseValue = () => {
        skipWhitespace();
        if (index >= len) {
            throw new SecurityValidationError('Malformed JSON content is not allowed.');
        }
        const current = rawBody[index];
        if (current === '{') {
            return parseObject();
        }
        if (current === '[') {
            return parseArray();
        }
        if (current === '"') {
            return parseString();
        }
        if (current === 't' || current === 'f' || current === 'n') {
            const literal = rawBody.slice(index).match(/^(true|false|null)/)?.[0];
            if (!literal) {
                throw new SecurityValidationError('Malformed JSON content is not allowed.');
            }
            index += literal.length;
            return literal === 'true' ? true : literal === 'false' ? false : null;
        }
        if (current === '-' || (current !== undefined && /\d/.test(current))) {
            const numberMatch = rawBody.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
            const value = numberMatch?.[0];
            if (!value) {
                throw new SecurityValidationError('Malformed JSON content is not allowed.');
            }
            index += value.length;
            return Number(value);
        }
        throw new SecurityValidationError('Malformed JSON content is not allowed.');
    };
    const parseObject = () => {
        const seen = new Set();
        const result = {};
        expect('{');
        skipWhitespace();
        if (rawBody[index] === '}') {
            index += 1;
            return result;
        }
        while (true) {
            skipWhitespace();
            const key = parseString();
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                throw new SecurityValidationError('Dangerous property names are not allowed.');
            }
            if (seen.has(key)) {
                throw new SecurityValidationError('Duplicate JSON keys are not allowed.');
            }
            seen.add(key);
            expect(':');
            result[key] = parseValue();
            skipWhitespace();
            if (rawBody[index] === '}') {
                index += 1;
                return result;
            }
            expect(',');
        }
    };
    const parseArray = () => {
        const result = [];
        expect('[');
        skipWhitespace();
        if (rawBody[index] === ']') {
            index += 1;
            return result;
        }
        while (true) {
            result.push(parseValue());
            skipWhitespace();
            if (rawBody[index] === ']') {
                index += 1;
                return result;
            }
            expect(',');
        }
    };
    try {
        parseValue();
        skipWhitespace();
        if (index !== len) {
            throw new SecurityValidationError('Malformed JSON content is not allowed.');
        }
    }
    catch (error) {
        if (error instanceof SecurityValidationError) {
            throw error;
        }
        throw new SecurityValidationError('Malformed JSON content is not allowed.');
    }
}
function rejectPrototypePollutionObject(value) {
    if (!value || typeof value !== 'object')
        return;
    const stack = [value];
    const seen = new Set();
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== 'object')
            continue;
        if (seen.has(current))
            continue;
        seen.add(current);
        const currentProto = Object.getPrototypeOf(current);
        if (currentProto && currentProto !== Object.prototype && currentProto !== null) {
            throw new SecurityValidationError('Prototype pollution attempt detected.');
        }
        const names = Object.getOwnPropertyNames(current);
        for (const key of names) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                throw new SecurityValidationError('Prototype pollution attempt detected.');
            }
            const nested = current[key];
            if (nested && typeof nested === 'object') {
                stack.push(nested);
            }
        }
    }
}
//# sourceMappingURL=duplicate-parameter.guard.js.map