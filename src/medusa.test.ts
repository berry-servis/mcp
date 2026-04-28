import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPendingOrder,
  getJamPacks,
  getProducts,
  type MedusaConfig,
} from './medusa.js';

const config: MedusaConfig = {
  backendUrl: 'http://localhost:9000',
  publishableKey: 'pk_test',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ products: [], order_id: 'o1', confirmation_token: 't' }),
      } as Response)
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('medusa client', () => {
  it('getProducts sends x-publishable-api-key header', async () => {
    await getProducts(config);
    const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls[0][0]).toBe('http://localhost:9000/store/products');
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['x-publishable-api-key']).toBe('pk_test');
  });

  it('getJamPacks queries the three corporate handles', async () => {
    await getJamPacks(config);
    const url = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0][0];
    expect(url).toContain('korporatni-dzemy-small');
    expect(url).toContain('korporatni-dzemy-medium');
    expect(url).toContain('korporatni-dzemy-large');
  });

  it('createPendingOrder POSTs to /store/firmy/orders/pending', async () => {
    await createPendingOrder(config, {
      items: [{ variant_id: 'v1', quantity: 30 }],
      metadata: {
        ico: '26155346',
        delivery_tuesday: '2026-06-09',
        delivery_contact_name: 'F',
        delivery_contact_phone: '+420123456789',
        delivery_address: 'Praha 1',
      },
      customer: { email: 'a@b.cz', name: 'F', phone: '+420123456789' },
    });
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe('http://localhost:9000/store/firmy/orders/pending');
    expect(init.method).toBe('POST');
  });
});
