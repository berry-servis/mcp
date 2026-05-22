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
  confirmation_token: string;
}

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

export async function createPendingOrder(
  config: MedusaConfig,
  req: OrderRequest
): Promise<CreatePendingOrderResponse> {
  return requestJson(config, '/store/office/orders/pending', {
    method: 'POST',
    body: JSON.stringify(req),
  });
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
