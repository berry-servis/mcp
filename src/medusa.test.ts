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

  it('createPendingOrder builds a cart with resolved variant ids and confirms it via /store/office/carts/:id/confirm', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const jsonRes = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        const method = (init.method ?? 'GET').toUpperCase();
        const body = init.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ url, method, body });

        if (method === 'GET' && url.includes('/store/products'))
          return jsonRes({
            products: [
              { id: 'p1', handle: 'strawberry-box', title: 'Box', variants: [{ id: 'variant_straw' }] },
              { id: 'p2', handle: 'mini-jam', title: 'Jam', variants: [{ id: 'variant_jam' }] },
            ],
          });
        if (method === 'GET' && url.includes('/store/regions'))
          return jsonRes({ regions: [{ id: 'reg_cz', countries: [{ iso_2: 'cz' }] }] });
        if (method === 'POST' && /\/store\/carts$/.test(url)) return jsonRes({ cart: { id: 'cart_1' } });
        if (method === 'POST' && /\/store\/carts\/cart_1$/.test(url)) return jsonRes({ cart: { id: 'cart_1' } });
        if (method === 'POST' && url.includes('/store/carts/cart_1/line-items')) return jsonRes({});
        if (method === 'GET' && url.includes('/store/shipping-options'))
          return jsonRes({ shipping_options: [{ id: 'so_1' }] });
        if (method === 'POST' && url.includes('/store/carts/cart_1/shipping-methods')) return jsonRes({});
        if (method === 'POST' && /\/store\/payment-collections$/.test(url))
          return jsonRes({ payment_collection: { id: 'pc_1' } });
        if (method === 'POST' && url.includes('/store/payment-collections/pc_1/payment-sessions'))
          return jsonRes({ payment_collection: { id: 'pc_1', payment_sessions: [] } });
        if (method === 'POST' && url.includes('/store/office/carts/cart_1/confirm'))
          return jsonRes({ order_id: 'order_1', display_id: '2026-AB12' });
        return Promise.reject(new Error(`unexpected ${method} ${url}`));
      })
    );

    const result = await createPendingOrder(config, {
      items: [
        { variant_id: 'strawberry-box', quantity: 30 },
        { variant_id: 'mini-jam', quantity: 30 },
      ],
      metadata: {
        ico: '26155346',
        delivery_tuesday: '2026-06-09',
        delivery_contact_name: 'Jana',
        delivery_contact_phone: '+420123456789',
        delivery_address: 'Praha 1',
        company_name: 'Acme s.r.o.',
      },
      customer: { email: 'a@b.cz', name: 'Jana', phone: '+420123456789' },
    });

    expect(result.order_id).toBe('order_1');

    // Line items must use RESOLVED variant ids, never the handle placeholders.
    const lineItemBodies = calls.filter((c) => c.url.includes('/line-items')).map((c) => c.body);
    expect(lineItemBodies).toContainEqual({ variant_id: 'variant_straw', quantity: 30 });
    expect(lineItemBodies).toContainEqual({ variant_id: 'variant_jam', quantity: 30 });

    // Confirmation goes through the office confirm route with a token, and the
    // same token was stored on the cart metadata when the cart was built.
    const confirmCall = calls.find((c) => c.url.includes('/store/office/carts/cart_1/confirm'));
    expect(confirmCall).toBeDefined();
    const token = (confirmCall!.body as { token?: string }).token;
    expect(typeof token).toBe('string');
    expect((token ?? '').length).toBeGreaterThan(0);
    const cartUpdate = calls.find((c) => /\/store\/carts\/cart_1$/.test(c.url) && c.method === 'POST');
    expect((cartUpdate!.body as { metadata?: { confirmation_token?: string } }).metadata?.confirmation_token).toBe(token);

    // B2B orders pay by invoice.
    const paySession = calls.find((c) => c.url.includes('/payment-sessions'));
    expect((paySession!.body as { provider_id?: string }).provider_id).toBe('invoice');
  });
});
