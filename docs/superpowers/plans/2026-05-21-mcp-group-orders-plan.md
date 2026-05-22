# MCP Group Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two MCP tools to `mcp-strawberries` so an AI assistant can create an office group order (returns a shareable code) and place a colleague's card order into it (returns a Comgate pay-link).

**Architecture:** Self-contained in the `mcp-strawberries` repo. `create_group_order` is pure (encodes office/date/address/token into a base64url group code). `place_group_order` decodes the code, validates, and composes the **standard Medusa store endpoints** (the same sequence `office/src/lib/placeOfficeOrder` uses) into a Comgate cart on the office channel, returning the payment session's `redirect_url`. No backend or office-frontend changes; the colleague pays and the existing consumer `/payment/return` completes the cart.

**Tech Stack:** TypeScript (NodeNext ESM - imports use `.js` extensions), `@modelcontextprotocol/sdk`, zod, vitest. Node 18+ globals (`fetch`, `crypto`, `Buffer`).

**Spec:** `mcp-strawberries/docs/superpowers/specs/2026-05-21-mcp-group-orders-design.md`

**Repo:** all work in `/Users/simonpokorry/Developer/berryservis/mcp-strawberries` (branch `docs/group-orders-spec` or a fresh `feat/group-orders`).

**Conventions (verified in the repo):**
- Tools are plain functions in `src/tools/*.ts`: pure ones export `(args) => result`; backend ones export `async (config, args) => result`. Registered in `src/server.ts` via `server.registerTool(name, { description, inputSchema: <zod shape> }, handler)`. Handlers wrap results with the local `jsonText(...)` helper; backend handlers call `loadConfig()` first.
- `src/medusa.ts` exposes `loadConfig()` -> `{ backendUrl, publishableKey }`, a private `requestJson<T>(config, path, init)` (sets `x-publishable-api-key`), and `getProducts(config)`.
- `src/lib/tuesdays.ts` exports `isStrawberrySeason(iso)` and `upcomingStrawberryTuesdays(now?)`.
- **Imports use `.js` extensions** (e.g. `import { isStrawberrySeason } from '../lib/tuesdays.js'`). Match this or the build breaks.
- Validation style: inline checks that throw `new Error('Validation failed: ...')` (see `src/tools/request-strawberry-order.ts`).
- CI gate: `npm run ci` = `lint && typecheck && test && build`. Run before each commit.
- Tests: vitest, colocated `*.test.ts`. Mock `fetch` (global) for `medusa.ts` tests; `vi.mock('../medusa.js')` for tool tests.

---

## File Structure

**Create:**
- `src/lib/group-code.ts` - encode/decode the group code + `generateGroupToken()`. Pure.
- `src/lib/group-code.test.ts`
- `src/lib/cutoff.ts` - `isPastCutoff(deliveryDate, now)` (Sunday 20:00 before the Tuesday). Pure.
- `src/lib/cutoff.test.ts`
- `src/tools/create-group-order.ts` - `createGroupOrder(args)`. Pure.
- `src/tools/create-group-order.test.ts`
- `src/tools/place-group-order.ts` - `placeGroupOrder(config, args)`.
- `src/tools/place-group-order.test.ts`

**Modify:**
- `src/medusa.ts` - add `createComgateCart(config, input)` and its helpers (`resolveRegionId`, `resolveVariants`, `resolveComgateProviderId`, `createComgatePaymentSession`).
- `src/medusa.test.ts` - add `createComgateCart` tests.
- `src/server.ts` - register the two tools; update server `instructions` (6 -> 8 tools).
- `.env.example` - document the two optional product-handle vars.

---

## Task 1: Group code (`src/lib/group-code.ts`)

**Files:** Create `src/lib/group-code.ts`, `src/lib/group-code.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/group-code.test.ts
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
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mcp-strawberries && npx vitest run src/lib/group-code.test.ts`
Expected: FAIL ("Cannot find module './group-code.js'").

- [ ] **Step 3: Implement**

```typescript
// src/lib/group-code.ts
export interface GroupParams {
  office: string;
  deliveryDate: string; // ISO YYYY-MM-DD
  address: string;
  token: string;
}

export function encodeGroupCode(p: GroupParams): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodeGroupCode(code: string): GroupParams | null {
  try {
    const obj = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Partial<GroupParams>;
    if (
      typeof obj.office === 'string' &&
      typeof obj.deliveryDate === 'string' &&
      typeof obj.address === 'string' &&
      typeof obj.token === 'string' &&
      obj.office && obj.deliveryDate && obj.address && obj.token
    ) {
      return { office: obj.office, deliveryDate: obj.deliveryDate, address: obj.address, token: obj.token };
    }
    return null;
  } catch {
    return null;
  }
}

export function generateGroupToken(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd mcp-strawberries && npx vitest run src/lib/group-code.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/lib/group-code.ts src/lib/group-code.test.ts
git commit -m "feat: group code encode/decode + token"
```

---

## Task 2: Cutoff (`src/lib/cutoff.ts`)

**Files:** Create `src/lib/cutoff.ts`, `src/lib/cutoff.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/cutoff.test.ts
import { describe, it, expect } from 'vitest';
import { isPastCutoff } from './cutoff.js';

// Delivery Tuesday 2026-06-09 -> cutoff Sunday 2026-06-07 20:00 (server local time).
describe('isPastCutoff', () => {
  it('is false well before the Sunday cutoff', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-05T12:00:00'))).toBe(false);
  });
  it('is false at 19:59 on the Sunday', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-07T19:59:00'))).toBe(false);
  });
  it('is true at 20:01 on the Sunday', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-07T20:01:00'))).toBe(true);
  });
  it('is true on the delivery day', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-09T08:00:00'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mcp-strawberries && npx vitest run src/lib/cutoff.test.ts`
Expected: FAIL ("Cannot find module './cutoff.js'").

- [ ] **Step 3: Implement**

```typescript
// src/lib/cutoff.ts
/**
 * Ordering closes at 20:00 on the Sunday before the delivery Tuesday.
 * Times are server-local (Railway runs UTC; precise CZ-timezone handling is a future refinement).
 */
export function isPastCutoff(deliveryDateIso: string, now: Date = new Date()): boolean {
  const tuesday = new Date(`${deliveryDateIso}T00:00:00`);
  if (Number.isNaN(tuesday.getTime())) return true; // unparseable -> treat as closed
  const cutoff = new Date(tuesday);
  cutoff.setDate(tuesday.getDate() - 2); // Sunday
  cutoff.setHours(20, 0, 0, 0);
  return now.getTime() > cutoff.getTime();
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd mcp-strawberries && npx vitest run src/lib/cutoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/lib/cutoff.ts src/lib/cutoff.test.ts
git commit -m "feat: Sunday 20:00 cutoff helper"
```

---

## Task 3: `create_group_order` tool

**Files:** Create `src/tools/create-group-order.ts`, `src/tools/create-group-order.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tools/create-group-order.test.ts
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
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mcp-strawberries && npx vitest run src/tools/create-group-order.test.ts`
Expected: FAIL ("Cannot find module './create-group-order.js'").

- [ ] **Step 3: Implement**

```typescript
// src/tools/create-group-order.ts
import { isStrawberrySeason } from '../lib/tuesdays.js';
import { encodeGroupCode, generateGroupToken } from '../lib/group-code.js';

export interface CreateGroupOrderArgs {
  office: string;
  delivery_date: string; // ISO Tuesday
  address: string;
}

export interface CreateGroupOrderResult {
  group_code: string;
  office: string;
  delivery_date: string;
  share_message: string;
}

export function createGroupOrder(args: CreateGroupOrderArgs): CreateGroupOrderResult {
  const errors: string[] = [];
  if (!args.office?.trim()) errors.push('office is required');
  if (!args.address?.trim()) errors.push('address is required (Prague only)');
  if (!isStrawberrySeason(args.delivery_date))
    errors.push('delivery_date must be a Tuesday in the strawberry season (May 12 - July 7)');
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);

  const office = args.office.trim();
  const token = generateGroupToken();
  const group_code = encodeGroupCode({
    office,
    deliveryDate: args.delivery_date,
    address: args.address.trim(),
    token,
  });

  const share_message =
    `Skupinova objednavka jahod do kancelare ${office}, rozvoz ${args.delivery_date}. ` +
    `Kazdy si objedna a zaplati sam pres AI asistenta pomoci tohoto kodu: ${group_code} ` +
    `(nastroj place_group_order). Doprava zdarma nad 2000 Kc, jinak 99 Kc hradi organizator.`;

  return { group_code, office, delivery_date: args.delivery_date, share_message };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd mcp-strawberries && npx vitest run src/tools/create-group-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/tools/create-group-order.ts src/tools/create-group-order.test.ts
git commit -m "feat: create_group_order tool (builds shareable group code)"
```

---

## Task 4: `createComgateCart` in `medusa.ts`

**Files:** Modify `src/medusa.ts`; add tests to `src/medusa.test.ts`.

Port the proven cart sequence from `office/src/lib/medusa.ts` `placeOfficeOrder`, adapted to the MCP's `requestJson(config, ...)` signature, resolving variants/provider dynamically and returning the Comgate `redirect_url`.

- [ ] **Step 1: Write the failing test** (mock `fetch`, drive one happy path)

```typescript
// add to src/medusa.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createComgateCart } from './medusa.js';

const config = { backendUrl: 'https://api.test', publishableKey: 'pk_test' };

function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => unknown>) {
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = handlers[i++]?.(url, init);
    return { ok: true, json: async () => body } as Response;
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('createComgateCart', () => {
  it('composes a cart and returns the comgate redirect_url', async () => {
    mockFetchSequence([
      () => ({ products: [{ id: 'prod_s', handle: 'jahodovy-box', title: 'Box', variants: [{ id: 'var_s', title: '1kg' }] }] }), // getProducts
      () => ({ regions: [{ id: 'reg_cz', countries: [{ iso_2: 'cz' }] }] }),  // /store/regions
      () => ({ cart: { id: 'cart_1' } }),                                      // POST /store/carts
      () => ({}),                                                              // POST /store/carts/:id (update)
      () => ({}),                                                              // POST line-items (boxes)
      () => ({ shipping_options: [{ id: 'so_free' }] }),                       // GET shipping-options
      () => ({}),                                                              // POST shipping-methods
      () => ({ payment_collection: { id: 'pc_1' } }),                          // POST payment-collections
      () => ({ payment_providers: [{ id: 'pp_comgate_comgate' }] }),           // GET payment-providers
      () => ({ payment_collection: { payment_sessions: [{ provider_id: 'pp_comgate_comgate', data: { redirect_url: 'https://pay.comgate/X' } }] } }), // POST payment-sessions
    ]);

    const out = await createComgateCart(config, {
      boxes: 3, jamAddon: false,
      metadata: { group_id: 'tok1', office: 'Acme', delivery_date: '2026-06-09', delivery_address: 'Praha 1' },
      customerEmail: 'a@b.cz', contactName: 'Jana',
    });
    expect(out).toEqual({ cart_id: 'cart_1', redirect_url: 'https://pay.comgate/X' });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mcp-strawberries && npx vitest run src/medusa.test.ts`
Expected: FAIL ("createComgateCart is not exported").

- [ ] **Step 3: Implement (append to `src/medusa.ts`)**

```typescript
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
    config, '/store/regions?limit=50'
  );
  const cz = regions.find((r) => (r.countries ?? []).some((c) => c.iso_2?.toLowerCase() === 'cz'));
  const id = cz?.id ?? regions[0]?.id;
  if (!id) throw new Error('Could not resolve a Medusa region.');
  cachedRegionId = id;
  return id;
}

async function resolveVariants(config: MedusaConfig): Promise<{ strawberryVariantId: string; miniJamVariantId: string | null }> {
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
    config, `/store/payment-providers?region_id=${encodeURIComponent(regionId)}`
  );
  const comgate = payment_providers.find((p) => p.id.toLowerCase().includes('comgate'));
  if (!comgate) throw new Error('Comgate payment provider is not available for this region.');
  return comgate.id;
}

async function createComgatePaymentSession(
  config: MedusaConfig, paymentCollectionId: string, providerId: string, cartId: string
): Promise<string> {
  const res = await requestJson<{ payment_collection: { payment_sessions?: Array<{ provider_id?: string; data?: { redirect_url?: string } }> } }>(
    config, `/store/payment-collections/${encodeURIComponent(paymentCollectionId)}/payment-sessions`,
    { method: 'POST', body: JSON.stringify({ provider_id: providerId, data: { cart_id: cartId } }) }
  );
  const sessions = res.payment_collection.payment_sessions ?? [];
  const session = sessions.find((s) => (s.provider_id ?? '').toLowerCase().includes('comgate')) ?? sessions[0];
  const url = session?.data?.redirect_url;
  if (!url) throw new Error('Comgate redirect URL missing from payment session response.');
  return url;
}

export async function createComgateCart(
  config: MedusaConfig, input: ComgateCartInput
): Promise<{ cart_id: string; redirect_url: string }> {
  const { strawberryVariantId, miniJamVariantId } = await resolveVariants(config);
  const regionId = await resolveRegionId(config);

  const { cart } = await requestJson<{ cart: { id: string } }>(config, '/store/carts', {
    method: 'POST', body: JSON.stringify({ region_id: regionId }),
  });

  const address = {
    first_name: input.contactName, last_name: '',
    company: String(input.metadata.office ?? ''),
    address_1: String(input.metadata.delivery_address ?? ''),
    city: 'Praha', country_code: 'cz',
  };
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}`, {
    method: 'POST',
    body: JSON.stringify({ email: input.customerEmail, shipping_address: address, billing_address: address, metadata: input.metadata }),
  });

  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/line-items`, {
    method: 'POST', body: JSON.stringify({ variant_id: strawberryVariantId, quantity: input.boxes }),
  });
  if (input.jamAddon && miniJamVariantId) {
    await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/line-items`, {
      method: 'POST', body: JSON.stringify({ variant_id: miniJamVariantId, quantity: input.boxes }),
    });
  }

  const { shipping_options } = await requestJson<{ shipping_options: Array<{ id: string }> }>(
    config, `/store/shipping-options?cart_id=${encodeURIComponent(cart.id)}&limit=50`
  );
  if (!shipping_options[0]) throw new Error('No shipping option available for this cart.');
  await requestJson(config, `/store/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: 'POST', body: JSON.stringify({ option_id: shipping_options[0].id }),
  });

  const { payment_collection } = await requestJson<{ payment_collection: { id: string } }>(
    config, '/store/payment-collections', { method: 'POST', body: JSON.stringify({ cart_id: cart.id }) }
  );
  const providerId = await resolveComgateProviderId(config, regionId);
  const redirect_url = await createComgatePaymentSession(config, payment_collection.id, providerId, cart.id);

  return { cart_id: cart.id, redirect_url };
}
```

(`getProducts`, `requestJson`, and `MedusaConfig` already exist in this file. `getProducts` currently fetches `/store/products`; that is sufficient - it returns variants.)

- [ ] **Step 4: Run test, verify it passes**

Run: `cd mcp-strawberries && npx vitest run src/medusa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/medusa.ts src/medusa.test.ts
git commit -m "feat: createComgateCart composes office-channel cart, returns comgate redirect"
```

---

## Task 5: `place_group_order` tool

**Files:** Create `src/tools/place-group-order.ts`, `src/tools/place-group-order.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tools/place-group-order.test.ts
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
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-05T10:00:00')); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('returns the pay_url and tags group metadata on valid input', async () => {
    const r = await placeGroupOrder(config, { group_code: code, boxes: 3, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'Jana' });
    expect(r.pay_url).toBe('https://pay.comgate/X');
    const arg = (createComgateCart as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(arg.metadata).toMatchObject({ group_id: 'tok1', office: 'Acme', delivery_date: '2026-06-09' });
    expect(arg.boxes).toBe(3);
  });
  it('rejects a bad group code', async () => {
    await expect(placeGroupOrder(config, { group_code: 'junk', boxes: 1, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })).rejects.toThrow();
  });
  it('rejects 0 boxes and bad email', async () => {
    await expect(placeGroupOrder(config, { group_code: code, boxes: 0, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })).rejects.toThrow();
    await expect(placeGroupOrder(config, { group_code: code, boxes: 1, jam_addon: false, contact_email: 'nope', contact_name: 'J' })).rejects.toThrow();
  });
  it('rejects past the Sunday cutoff', async () => {
    vi.setSystemTime(new Date('2026-06-08T09:00:00')); // Monday before delivery
    await expect(placeGroupOrder(config, { group_code: code, boxes: 1, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' })).rejects.toThrow();
  });
  it('accepts a large box count (no upper limit)', async () => {
    const r = await placeGroupOrder(config, { group_code: code, boxes: 250, jam_addon: false, contact_email: 'a@b.cz', contact_name: 'J' });
    expect(r.pay_url).toBe('https://pay.comgate/X');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mcp-strawberries && npx vitest run src/tools/place-group-order.test.ts`
Expected: FAIL ("Cannot find module './place-group-order.js'").

- [ ] **Step 3: Implement**

```typescript
// src/tools/place-group-order.ts
import { createComgateCart, type MedusaConfig } from '../medusa.js';
import { decodeGroupCode } from '../lib/group-code.js';
import { isStrawberrySeason } from '../lib/tuesdays.js';
import { isPastCutoff } from '../lib/cutoff.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PlaceGroupOrderArgs {
  group_code: string;
  boxes: number;
  jam_addon: boolean;
  contact_email: string;
  contact_name: string;
}

export interface PlaceGroupOrderResult {
  pay_url: string;
  message: string;
}

export async function placeGroupOrder(
  config: MedusaConfig, args: PlaceGroupOrderArgs
): Promise<PlaceGroupOrderResult> {
  const group = decodeGroupCode(args.group_code);
  if (!group) throw new Error('Neplatny kod skupiny (group_code).');

  const errors: string[] = [];
  if (!isStrawberrySeason(group.deliveryDate)) errors.push('group delivery date is not an open season Tuesday');
  if (isPastCutoff(group.deliveryDate)) errors.push('this group is closed (past the Sunday 20:00 cutoff)');
  if (!Number.isInteger(args.boxes) || args.boxes < 1) errors.push('boxes must be an integer >= 1');
  if (!EMAIL_RE.test(args.contact_email ?? '')) errors.push('contact_email is not a valid email');
  if (!args.contact_name?.trim()) errors.push('contact_name is required');
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);

  const { redirect_url } = await createComgateCart(config, {
    boxes: args.boxes,
    jamAddon: args.jam_addon,
    metadata: {
      group_id: group.token,
      office: group.office,
      delivery_date: group.deliveryDate,
      delivery_address: group.address,
      contact_name: args.contact_name.trim(),
    },
    customerEmail: args.contact_email,
    contactName: args.contact_name.trim(),
  });

  return {
    pay_url: redirect_url,
    message:
      `Otevrete odkaz a zaplatte kartou: ${redirect_url}. ` +
      `Po zaplaceni je objednavka potvrzena. Rozvoz ${group.deliveryDate} dopoledne do kancelare ${group.office}.`,
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd mcp-strawberries && npx vitest run src/tools/place-group-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/tools/place-group-order.ts src/tools/place-group-order.test.ts
git commit -m "feat: place_group_order tool (comgate pay-link for a colleague)"
```

---

## Task 6: Register the tools + full CI

**Files:** Modify `src/server.ts`, `.env.example`.

- [ ] **Step 1: Register both tools in `src/server.ts`**

Add imports near the other tool imports:

```typescript
import { createGroupOrder, type CreateGroupOrderArgs } from './tools/create-group-order.js';
import { placeGroupOrder, type PlaceGroupOrderArgs } from './tools/place-group-order.js';
```

Inside `createServer()`, after the existing `registerTool` calls, add:

```typescript
  server.registerTool(
    'create_group_order',
    {
      description:
        'Start a self-serve office group order. Returns a shareable group_code (and a ready-to-send message) that colleagues use with place_group_order. delivery_date must be a Tuesday in season (use list_available_tuesdays). No payment here.',
      inputSchema: {
        office: z.string().min(1),
        delivery_date: z.string().describe('ISO date (YYYY-MM-DD) of the chosen Tuesday'),
        address: z.string().min(1).describe('Office delivery address (Prague only)'),
      },
    },
    async (args) => jsonText(createGroupOrder(args as CreateGroupOrderArgs))
  );

  server.registerTool(
    'place_group_order',
    {
      description:
        'Place a colleague order into a group (from its group_code) and get a Comgate card pay-link to open. boxes is the number of 1 kg strawberry boxes (>= 1, no upper limit). Returns pay_url; the order confirms once the card payment is made.',
      inputSchema: {
        group_code: z.string().min(1),
        boxes: z.number().int().min(1),
        jam_addon: z.boolean(),
        contact_email: z.string(),
        contact_name: z.string().min(1),
      },
    },
    async (args) => {
      const config = loadConfig();
      return jsonText(await placeGroupOrder(config, args as PlaceGroupOrderArgs));
    }
  );
```

Update the `instructions` string to mention the group flow, e.g. append: `For a self-serve group buy, use create_group_order to get a shareable code, then place_group_order to get a card pay-link for each colleague.`

- [ ] **Step 2: Document the optional env vars in `.env.example`**

```
# Optional: product handles used by group orders (defaults shown)
MEDUSA_STRAWBERRY_HANDLE=jahodovy-box
# MEDUSA_MINI_JAM_HANDLE=   # set to enable the jam add-on in place_group_order
```

- [ ] **Step 3: Run the full CI gate**

Run: `cd mcp-strawberries && npm run ci`
Expected: lint + typecheck + all vitest tests + build all PASS.

- [ ] **Step 4: Live smoke (test mode) - verify the runtime-resolved IDs**

With a `.env` pointing at the backend (test Comgate), build and run the stdio server, then exercise the tools (e.g. via an MCP client or a small script):
```bash
cd mcp-strawberries && npm run build && node dist/stdio.js
```
Confirm: `create_group_order` returns a code; `place_group_order` returns a `pay_url`. **This is where the dynamically-resolved IDs are validated against reality** - the strawberry handle (`MEDUSA_STRAWBERRY_HANDLE`), the Comgate provider id, and the free office shipping option. Fix env/handles if resolution fails.

- [ ] **Step 5: Commit**

```bash
cd mcp-strawberries && git add src/server.ts .env.example
git commit -m "feat: register create_group_order + place_group_order (6 -> 8 tools)"
```

---

## Task 7: Operational follow-ups (not code)

- [ ] Deploy the server at `mcp.berryservis.cz` (Streamable HTTP) so the site's claim is true; set `MEDUSA_BACKEND_URL`, `MEDUSA_OFFICE_PUBLISHABLE_KEY`, and (if enabling jams) `MEDUSA_MINI_JAM_HANDLE`.
- [ ] Office channel must have the strawberry product (and optional mini-jam) published in production (shared go-live prerequisite).
- [ ] Update `office/src/sections/McpForDevelopers.tsx`: fix the GitHub link to `berry-servis/mcp-strawberries` and change "6 nastroju" to "8 nastroju". (Separate office-repo change.)

---

## Self-Review

**Spec coverage:** `create_group_order` (Task 3) and `place_group_order` (Task 5) both built; group code = base64url JSON (Task 1); cutoff Sunday 20:00 (Task 2); Comgate cart via standard store endpoints, no backend change (Task 4); office channel + free shipping reused (Task 4); min 1 / no upper limit (Task 5 validation + test); guest, card-gated, one-shot (whole design); tools registered 6 -> 8 (Task 6); operational deploy + site-copy fix (Task 7). Order-tracking + jam-handle generality correctly left as future.

**Placeholder scan:** Tasks 1-3, 5, 6 have complete code + tests. Task 4 is complete code ported from the verified `placeOfficeOrder` sequence; the only runtime-resolved values (region, comgate provider id, variant ids, shipping option) are resolved dynamically and explicitly validated in Task 6 Step 4 - that is a verification step, not a placeholder.

**Type consistency:** `GroupParams` (Task 1) consumed by Tasks 3 and 5; `ComgateCartInput` + `createComgateCart` return `{cart_id, redirect_url}` (Task 4) consumed in Task 5; `CreateGroupOrderArgs`/`PlaceGroupOrderArgs` defined in the tools and reused in `server.ts` (Task 6); `MedusaConfig` re-exported from `medusa.ts` and imported by `place-group-order.ts`. (Confirm `MedusaConfig` is exported in `medusa.ts` - it is.)

**Risk to watch:** the jam add-on depends on `MEDUSA_MINI_JAM_HANDLE`; if unset/unfound, `place_group_order` silently ships boxes only. That is intentional for v1 (boxes are the core); enabling jams is one env var + the smoke check.
