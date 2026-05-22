import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/availability.js', () => ({
  fetchOpenTuesdays: vi.fn(async () => ['2026-06-09']),
}));

import { createGroupOrder } from './create-group-order.js';
import { decodeGroupCode } from '../lib/group-code.js';

describe('createGroupOrder', () => {
  it('returns a decodable code echoing the inputs', async () => {
    const r = await createGroupOrder({ office: 'Acme s.r.o.', delivery_date: '2026-06-09', address: 'Karlovo nam. 1' });
    const decoded = decodeGroupCode(r.group_code);
    expect(decoded?.office).toBe('Acme s.r.o.');
    expect(decoded?.deliveryDate).toBe('2026-06-09');
    expect(decoded?.token).toMatch(/^[a-z0-9]{8,}$/);
    expect(r.share_message).toContain(r.group_code);
  });
  it('rejects a date that is not an open delivery Tuesday', async () => {
    await expect(createGroupOrder({ office: 'X', delivery_date: '1999-01-01', address: 'Y' })).rejects.toThrow();
  });
  it('rejects empty office/address', async () => {
    await expect(createGroupOrder({ office: '', delivery_date: '2026-06-09', address: 'Y' })).rejects.toThrow();
  });
});
