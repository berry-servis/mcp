import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeGroupCode } from '../lib/group-code.js';

vi.mock('../medusa.js', () => ({
  createComgateCart: vi.fn(async () => ({ cart_id: 'cart_1', redirect_url: 'https://pay.comgate/X' })),
}));

import { placeGroupOrder } from './place-group-order.js';
import { createComgateCart } from '../medusa.js';

const config = { backendUrl: 'https://api.test', publishableKey: 'pk_test' };
const code = encodeGroupCode({ office: 'Acme', deliveryDate: '2026-06-09', address: 'Praha 1', token: 'tok1' });

describe('placeGroupOrder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns the pay_url and tags group metadata on valid input', async () => {
    const r = await placeGroupOrder(config, {
      group_code: code,
      boxes: 3,
      jam_addon: false,
      contact_email: 'a@b.cz',
      contact_name: 'Jana',
    });
    expect(r.pay_url).toBe('https://pay.comgate/X');
    const arg = (createComgateCart as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(arg.metadata).toMatchObject({ group_id: 'tok1', office: 'Acme', delivery_date: '2026-06-09' });
    expect(arg.boxes).toBe(3);
  });
  it('rejects a bad group code', async () => {
    await expect(
      placeGroupOrder(config, { group_code: 'junk', boxes: 1, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })
    ).rejects.toThrow();
  });
  it('rejects 0 boxes and bad email', async () => {
    await expect(
      placeGroupOrder(config, { group_code: code, boxes: 0, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })
    ).rejects.toThrow();
    await expect(
      placeGroupOrder(config, { group_code: code, boxes: 1, jam_addon: false, contact_email: 'nope', contact_name: 'J' })
    ).rejects.toThrow();
  });
  it('rejects past the Monday cutoff', async () => {
    vi.setSystemTime(new Date('2026-06-08T10:01:00')); // Monday after 10:00, before delivery
    await expect(
      placeGroupOrder(config, { group_code: code, boxes: 1, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })
    ).rejects.toThrow();
  });
  it('accepts a large box count (no upper limit)', async () => {
    const r = await placeGroupOrder(config, {
      group_code: code,
      boxes: 250,
      jam_addon: false,
      contact_email: 'a@b.cz',
      contact_name: 'J',
    });
    expect(r.pay_url).toBe('https://pay.comgate/X');
  });
});
