import { randomUUID } from 'node:crypto';

export interface CartItem {
  variant_id: string;
  quantity: number;
}

export interface B2BMetadata {
  ico: string;
  dic?: string;
  delivery_tuesday: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_address: string;
  delivery_notes?: string;
  jam_addon?: boolean;
  company_name?: string;
}

export interface CustomerInfo {
  email: string;
  name: string;
  phone: string;
}

export interface OrderRequest {
  items: CartItem[];
  metadata: B2BMetadata;
  customer: CustomerInfo;
}

export interface MedusaProduct {
  id: string;
  handle: string;
  title: string;
  variants: Array<{
    id: string;
    title: string;
    calculated_price?: { calculated_amount?: number; currency_code?: string } | null;
  }>;
}

interface CreatePendingOrderResponse {
  order_id: string;
  display_id?: string | number;
}

// B2B office orders are paid by invoice (matches the office storefront's
// placeOfficeOrder). Kept as a named constant so both consumers agree.
const B2B_PAYMENT_PROVIDER_ID = 'invoice';

export interface MedusaConfig {
  backendUrl: string;
  publishableKey: string;
}

export function loadConfig(): MedusaConfig {
  const backendUrl = process.env.MEDUSA_BACKEND_URL;
  const publishableKey = process.env.MEDUSA_OFFICE_PUBLISHABLE_KEY;
  if (!backendUrl) throw new Error('MEDUSA_BACKEND_URL is required');
  if (!publishableKey) throw new Error('MEDUSA_OFFICE_PUBLISHABLE_KEY is required');
  return { backendUrl: backendUrl.replace(/\/$/, ''), publishableKey };
}

async function requestJson<T>(
  config: MedusaConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-publishable-api-key': config.publishableKey,
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await fetch(`${config.backendUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      // ignore
    }
    throw new Error(`Medusa request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

export async function getProducts(
  config: MedusaConfig
): Promise<{ products: MedusaProduct[] }> {
  return requestJson(config, '/store/products');
}

export async function getJamPacks(
  config: MedusaConfig
): Promise<{ products: MedusaProduct[] }> {
  const handles = [
    'korporatni-dzemy-small',
    'korporatni-dzemy-medium',
    'korporatni-dzemy-large',
  ];
  const query = handles.map((h) => `handle[]=${encodeURIComponent(h)}`).join('&');
  return requestJson(config, `/store/products?${query}`);
}

/** Resolve product handles -> first-variant ids on the office channel. */
async function resolveVariantIdsByHandle(
  config: MedusaConfig,
  handles: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(handles)];
  const query = unique.map((h) => `handle[]=${encodeURIComponent(h)}`).join('&');
  const { products } = await requestJson<{ products: MedusaProduct[] }>(
    config,
    `/store/products?${query}`
  );
  const map = new Map<string, string>();
  for (const p of products) {
    const variantId = p.variants?.[0]?.id;
    if (variantId) map.set(p.handle, variantId);
  }
  return map;
}

/**
 * Place a B2B office order by building a cart and confirming it through the
 * existing `/store/office/carts/:id/confirm` route — the same completion path
 * the office storefront uses. Items arrive as product *handles*; we resolve
 * them to real variant ids (the previous code sent handles as variant_id, which
 * would never resolve), build the cart on the office channel, attach the
 * invoice payment session, and confirm with a server-stored token.
 */
export async function createPendingOrder(
  config: MedusaConfig,
  req: OrderRequest
): Promise<CreatePendingOrderResponse> {
  const variantByHandle = await resolveVariantIdsByHandle(
    config,
    req.items.map((i) => i.variant_id)
  );
  const lineItems = req.items.map((item) => {
    const variantId = variantByHandle.get(item.variant_id);
    if (!variantId) {
      throw new Error(
        `Product "${item.variant_id}" is not published on the office sales channel.`
      );
    }
    return { variant_id: variantId, quantity: item.quantity };
  });

  const regionId = await resolveRegionId(config);
  const { cart } = await requestJson<{ cart: { id: string } }>(config, '/store/carts', {
    method: 'POST',
    body: JSON.stringify({ region_id: regionId }),
  });

  const confirmationToken = randomUUID();
  const address = {
    first_name: req.customer.name,
    last_name: '',
    company: req.metadata.company_name ?? '',
    address_1: req.metadata.delivery_address,
    city: 'Praha',
    country_code: 'cz',
  };
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}`, {
    method: 'POST',
    body: JSON.stringify({
      email: req.customer.email,
      shipping_address: address,
      billing_address: address,
      metadata: { ...req.metadata, confirmation_token: confirmationToken },
    }),
  });

  for (const li of lineItems) {
    await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/line-items`, {
      method: 'POST',
      body: JSON.stringify(li),
    });
  }

  const { shipping_options } = await requestJson<{ shipping_options: Array<{ id: string }> }>(
    config,
    `/store/shipping-options?cart_id=${encodeURIComponent(cart.id)}&limit=50`
  );
  if (!shipping_options[0]) throw new Error('No shipping option available for this cart.');
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: 'POST',
    body: JSON.stringify({ option_id: shipping_options[0].id }),
  });

  const { payment_collection } = await requestJson<{ payment_collection: { id: string } }>(
    config,
    '/store/payment-collections',
    { method: 'POST', body: JSON.stringify({ cart_id: cart.id }) }
  );
  await requestJson(
    config,
    `/store/payment-collections/${encodeURIComponent(payment_collection.id)}/payment-sessions`,
    { method: 'POST', body: JSON.stringify({ provider_id: B2B_PAYMENT_PROVIDER_ID }) }
  );

  const confirmed = await requestJson<{ order_id: string; display_id?: string | number | null }>(
    config,
    `/store/office/carts/${encodeURIComponent(cart.id)}/confirm`,
    { method: 'POST', body: JSON.stringify({ token: confirmationToken }) }
  );
  return { order_id: confirmed.order_id, display_id: confirmed.display_id ?? undefined };
}

/* ---------- Group orders: Comgate cart composition ---------- */

const STRAWBERRY_HANDLE = (process.env.MEDUSA_STRAWBERRY_HANDLE ?? '').trim() || 'jahodovy-box';
const MINI_JAM_HANDLE = (process.env.MEDUSA_MINI_JAM_HANDLE ?? '').trim(); // optional; jam add-on skipped if unset/unfound

export interface ComgateCartInput {
  boxes: number;
  jamAddon: boolean;
  metadata: Record<string, unknown>;
  customerEmail: string;
  contactName: string;
}

let cachedRegionId: string | null = null;

async function resolveRegionId(config: MedusaConfig): Promise<string> {
  if (cachedRegionId) return cachedRegionId;
  const { regions } = await requestJson<{ regions: Array<{ id: string; countries?: Array<{ iso_2?: string }> }> }>(
    config,
    '/store/regions?limit=50'
  );
  const cz = regions.find((r) => (r.countries ?? []).some((c) => c.iso_2?.toLowerCase() === 'cz'));
  const id = cz?.id ?? regions[0]?.id;
  if (!id) throw new Error('Could not resolve a Medusa region.');
  cachedRegionId = id;
  return id;
}

async function resolveVariants(
  config: MedusaConfig
): Promise<{ strawberryVariantId: string; miniJamVariantId: string | null }> {
  const { products } = await getProducts(config);
  const straw = products.find((p) => p.handle === STRAWBERRY_HANDLE);
  const strawberryVariantId = straw?.variants?.[0]?.id;
  if (!strawberryVariantId)
    throw new Error(`Strawberry product (handle "${STRAWBERRY_HANDLE}") is not published on the office channel.`);
  let miniJamVariantId: string | null = null;
  if (MINI_JAM_HANDLE) {
    miniJamVariantId = products.find((p) => p.handle === MINI_JAM_HANDLE)?.variants?.[0]?.id ?? null;
  }
  return { strawberryVariantId, miniJamVariantId };
}

async function resolveComgateProviderId(config: MedusaConfig, regionId: string): Promise<string> {
  const { payment_providers } = await requestJson<{ payment_providers: Array<{ id: string }> }>(
    config,
    `/store/payment-providers?region_id=${encodeURIComponent(regionId)}`
  );
  const comgate = payment_providers.find((p) => p.id.toLowerCase().includes('comgate'));
  if (!comgate) throw new Error('Comgate payment provider is not available for this region.');
  return comgate.id;
}

async function createComgatePaymentSession(
  config: MedusaConfig,
  paymentCollectionId: string,
  providerId: string,
  cartId: string
): Promise<string> {
  const res = await requestJson<{
    payment_collection: { payment_sessions?: Array<{ provider_id?: string; data?: { redirect_url?: string } }> };
  }>(config, `/store/payment-collections/${encodeURIComponent(paymentCollectionId)}/payment-sessions`, {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId, data: { cart_id: cartId } }),
  });
  const sessions = res.payment_collection.payment_sessions ?? [];
  const session = sessions.find((s) => (s.provider_id ?? '').toLowerCase().includes('comgate')) ?? sessions[0];
  const url = session?.data?.redirect_url;
  if (!url) throw new Error('Comgate redirect URL missing from payment session response.');
  return url;
}

export async function createComgateCart(
  config: MedusaConfig,
  input: ComgateCartInput
): Promise<{ cart_id: string; redirect_url: string }> {
  const { strawberryVariantId, miniJamVariantId } = await resolveVariants(config);
  const regionId = await resolveRegionId(config);

  const { cart } = await requestJson<{ cart: { id: string } }>(config, '/store/carts', {
    method: 'POST',
    body: JSON.stringify({ region_id: regionId }),
  });

  const address = {
    first_name: input.contactName,
    last_name: '',
    company: String(input.metadata.office ?? ''),
    address_1: String(input.metadata.delivery_address ?? ''),
    city: 'Praha',
    country_code: 'cz',
  };
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}`, {
    method: 'POST',
    body: JSON.stringify({
      email: input.customerEmail,
      shipping_address: address,
      billing_address: address,
      metadata: input.metadata,
    }),
  });

  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/line-items`, {
    method: 'POST',
    body: JSON.stringify({ variant_id: strawberryVariantId, quantity: input.boxes }),
  });
  if (input.jamAddon && miniJamVariantId) {
    await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/line-items`, {
      method: 'POST',
      body: JSON.stringify({ variant_id: miniJamVariantId, quantity: input.boxes }),
    });
  }

  const { shipping_options } = await requestJson<{ shipping_options: Array<{ id: string }> }>(
    config,
    `/store/shipping-options?cart_id=${encodeURIComponent(cart.id)}&limit=50`
  );
  if (!shipping_options[0]) throw new Error('No shipping option available for this cart.');
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: 'POST',
    body: JSON.stringify({ option_id: shipping_options[0].id }),
  });

  const { payment_collection } = await requestJson<{ payment_collection: { id: string } }>(
    config,
    '/store/payment-collections',
    { method: 'POST', body: JSON.stringify({ cart_id: cart.id }) }
  );
  const providerId = await resolveComgateProviderId(config, regionId);
  const redirect_url = await createComgatePaymentSession(config, payment_collection.id, providerId, cart.id);

  return { cart_id: cart.id, redirect_url };
}
