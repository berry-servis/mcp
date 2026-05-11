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
