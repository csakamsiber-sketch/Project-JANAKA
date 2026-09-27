export class SecurityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

export function rejectDuplicateQueryParameters(rawUrl: string): void {
  const search = rawUrl.split('?')[1];
  if (!search) return;

  const seen = new Set<string>();
  const pairs = search.split('&');

  for (const pair of pairs) {
    if (!pair) continue;

    let decoded: string;
    try {
      decoded = decodeURIComponent(pair);
    } catch {
      throw new SecurityValidationError('Duplicate query parameters are not allowed.');
    }

    const key = decoded.split('=')[0];
    if (!key) continue;
    if (seen.has(key)) {
      throw new SecurityValidationError('Duplicate query parameters are not allowed.');
    }
    seen.add(key);
  }
}

export function rejectDuplicateJsonKeys(rawBody: string): void {
  let index = 0;
  const len = rawBody.length;

  const skipWhitespace = () => {
    while (index < len && /\s/.test(rawBody[index] ?? '')) {
      index += 1;
    }
  };

  const expect = (char: string) => {
    skipWhitespace();
    if (rawBody[index] !== char) {
      throw new SecurityValidationError('Malformed JSON content is not allowed.');
    }
    index += 1;
  };

  const parseString = (): string => {
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
        const map: Record<string, string> = {
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

  const parseValue = (): unknown => {
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

  const parseObject = (): Record<string, unknown> => {
    const seen = new Set<string>();
    const result: Record<string, unknown> = {};

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

  const parseArray = (): unknown[] => {
    const result: unknown[] = [];

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
  } catch (error) {
    if (error instanceof SecurityValidationError) {
      throw error;
    }
    throw new SecurityValidationError('Malformed JSON content is not allowed.');
  }
}

export function rejectPrototypePollutionObject(value: unknown): void {
  if (!value || typeof value !== 'object') return;

  const stack: unknown[] = [value];
  const seen = new Set<unknown>();

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const currentProto = Object.getPrototypeOf(current as object);
    if (currentProto && currentProto !== Object.prototype && currentProto !== null) {
      throw new SecurityValidationError('Prototype pollution attempt detected.');
    }

    const names = Object.getOwnPropertyNames(current as Record<string, unknown>);
    for (const key of names) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new SecurityValidationError('Prototype pollution attempt detected.');
      }

      const nested = (current as Record<string, unknown>)[key];
      if (nested && typeof nested === 'object') {
        stack.push(nested);
      }
    }
  }
}
