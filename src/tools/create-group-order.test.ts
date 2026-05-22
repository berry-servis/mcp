import { describe, it, expect } from 'vitest';
import { createGroupOrder } from './create-group-order.js';
import { decodeGroupCode } from '../lib/group-code.js';

describe('createGroupOrder', () => {
  it('returns a decodable code echoing the inputs', () => {
    const r = createGroupOrder({ office: 'Acme s.r.o.', delivery_date: '2026-06-09', address: 'Karlovo nam. 1' });
    const decoded = decodeGroupCode(r.group_code);
    expect(decoded?.office).toBe('Acme s.r.o.');
    expect(decoded?.deliveryDate).toBe('2026-06-09');
    expect(decoded?.token).toMatch(/^[a-z0-9]{8,}$/);
    expect(r.share_message).toContain(r.group_code);
  });
  it('rejects a date that is not a season Tuesday', () => {
    expect(() => createGroupOrder({ office: 'X', delivery_date: '1999-01-01', address: 'Y' })).toThrow();
  });
  it('rejects empty office/address', () => {
    expect(() => createGroupOrder({ office: '', delivery_date: '2026-06-09', address: 'Y' })).toThrow();
  });
});
