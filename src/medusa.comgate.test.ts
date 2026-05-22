import { describe, it, expect, vi, afterEach } from 'vitest';
import { createComgateCart } from './medusa.js';

const config = { backendUrl: 'https://api.test', publishableKey: 'pk_test' };

function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => unknown>) {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handlers[i++]?.(url, init);
      return { ok: true, json: async () => body } as Response;
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('createComgateCart', () => {
  it('composes a cart and returns the comgate redirect_url', async () => {
    mockFetchSequence([
      () => ({ products: [{ id: 'prod_s', handle: 'jahodovy-box', title: 'Box', variants: [{ id: 'var_s', title: '1kg' }] }] }), // getProducts
      () => ({ regions: [{ id: 'reg_cz', countries: [{ iso_2: 'cz' }] }] }), // /store/regions
      () => ({ cart: { id: 'cart_1' } }), // POST /store/carts
      () => ({}), // POST /store/carts/:id (update)
      () => ({}), // POST line-items (boxes)
      () => ({ shipping_options: [{ id: 'so_free' }] }), // GET shipping-options
      () => ({}), // POST shipping-methods
      () => ({ payment_collection: { id: 'pc_1' } }), // POST payment-collections
      () => ({ payment_providers: [{ id: 'pp_comgate_comgate' }] }), // GET payment-providers
      () => ({
        payment_collection: {
          payment_sessions: [{ provider_id: 'pp_comgate_comgate', data: { redirect_url: 'https://pay.comgate/X' } }],
        },
      }), // POST payment-sessions
    ]);

    const out = await createComgateCart(config, {
      boxes: 3,
      jamAddon: false,
      metadata: { group_id: 'tok1', office: 'Acme', delivery_date: '2026-06-09', delivery_address: 'Praha 1' },
      customerEmail: 'a@b.cz',
      contactName: 'Jana',
    });
    expect(out).toEqual({ cart_id: 'cart_1', redirect_url: 'https://pay.comgate/X' });
  });
});
