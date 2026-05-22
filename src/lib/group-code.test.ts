import { describe, it, expect } from 'vitest';
import { encodeGroupCode, decodeGroupCode, generateGroupToken, type GroupParams } from './group-code.js';

const sample: GroupParams = {
  office: 'Acme s.r.o.',
  deliveryDate: '2026-06-09',
  address: 'Karlovo nam. 1, Praha 2',
  token: 'abc123def456',
};

describe('group-code', () => {
  it('round-trips encode -> decode', () => {
    expect(decodeGroupCode(encodeGroupCode(sample))).toEqual(sample);
  });
  it('decode returns null on garbage', () => {
    expect(decodeGroupCode('not-a-real-code')).toBeNull();
  });
  it('decode returns null when a field is missing', () => {
    const partial = Buffer.from(JSON.stringify({ office: 'X' })).toString('base64url');
    expect(decodeGroupCode(partial)).toBeNull();
  });
  it('generateGroupToken is url-safe and unique', () => {
    const t = generateGroupToken();
    expect(t).toMatch(/^[a-z0-9]{8,}$/);
    expect(generateGroupToken()).not.toBe(t);
  });
});
