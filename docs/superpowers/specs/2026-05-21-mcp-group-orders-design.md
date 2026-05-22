# mcp-strawberries - Group Orders Design

**Date:** 2026-05-21
**Status:** Draft for review (scope settled).
**Builds on:** the existing `mcp-strawberries` server (6 tools, office sales channel, stdio + Streamable HTTP) and the consumer storefront's Comgate checkout (`website/`). Companion to the parked lean web group-order spec (`office/docs/superpowers/specs/2026-05-21-office-group-order-design.md`).

## Goal

Let an AI assistant run a self-serve **office group order** end to end: an organizer creates a group and gets a shareable code; each colleague pastes that code to their AI, orders their own boxes, and gets a **Comgate card pay-link** to click. This makes the group-order channel real **via MCP only** - a deliberately niche, opt-in path (expected ~5% of users) that needs **no office-frontend page and no backend change**.

## Scope (what makes this small)

- **Two new MCP tools** in `mcp-strawberries`, plus one shared helper and one new `medusa.ts` function. Reuses the existing `list_available_tuesdays`, `get_quote`, `get_jam_packs`, and the office publishable key.
- **Zero office-frontend work** (the lean web group page is parked) and **zero backend work**: the group cart is composed from the **standard Medusa store endpoints** the publishable key already allows, and Comgate's existing consumer return flow completes it.
- Berry Servis tracks the resulting orders in the **orders Sheet** already built (grouped by office + delivery date); the 99 Kc under-2 000 fee stays **manual**.

## Settled decisions

- **No server-side group record (lean).** The group lives entirely in a **group code** the organizer shares. The code encodes `office`, `delivery_date`, `address`, and a random `group_token`; it is `base64url(JSON)` so it pastes as one opaque string.
- **`group_token` is the join key.** Every colleague order carries `metadata.group_id = group_token` (plus office/date/address), so the Sheet groups them.
- **Card via Comgate, returned as a pay-link.** An AI can't enter card details, so `place_group_order` returns the Comgate `redirect_url`. The human clicks it, pays, and lands on the **existing consumer** `/payment/return` page, which completes the cart. (No office return page, no `return_url` override in v1.)
- **Office sales channel + retail prices**, same as the web doors. Catalog v1 = strawberry boxes (1 kg) + optional mini-jam, matching the existing tools' variant handles.
- **Per-colleague quantity: min 1 / max 10 boxes** (a colleague orders for themselves), distinct from the invoice tool's 20-100.
- **Date validity** reuses `isStrawberrySeason()`; an order is refused if the encoded date is not an open season Tuesday or is past the **Sunday 20:00 cutoff**.

## The two tools

### `create_group_order`
- **Input:** `office: string`, `delivery_date: string` (ISO Tuesday), `address: string`.
- **Does:** validates the date (`isStrawberrySeason`), generates a `group_token`, encodes the **group code**. Pure - no network.
- **Returns:** `{ group_code, office, delivery_date, share_message }` where `share_message` is a ready-to-send Czech sentence telling colleagues to order with this code (free delivery over 2 000 Kc, otherwise a 99 Kc fee covered by the organizer).

### `place_group_order`
- **Input:** `group_code: string`, `boxes: number` (1-10), `jam_addon: boolean`, `contact_email: string`, `contact_name: string`.
- **Does:** decodes + validates the code (good code, date still open, boxes 1-10, valid email); composes a Comgate cart on the office channel tagged with `metadata { group_id, office, delivery_date, delivery_address, contact_name }`; returns the pay-link.
- **Returns:** `{ pay_url, message }` - `message` instructs the colleague to open `pay_url`, pay by card, and that the order confirms once paid; delivery on the group's Tuesday.

## Architecture / components (all in `mcp-strawberries/`)

- **`src/lib/group-code.ts` (new):** `encodeGroupCode(params)`, `decodeGroupCode(code): GroupCodeParams | null`, `generateGroupToken()`. Pure, TDD'd (mirror `src/lib/tuesdays.test.ts`).
- **`src/lib/cutoff.ts` (new) or extend `tuesdays.ts`:** `isPastCutoff(deliveryDate, now)` - true after the Sunday 20:00 before the delivery Tuesday. TDD'd.
- **`src/tools/create-group-order.ts` (new):** `createGroupOrder(args)` (pure; no `config` needed).
- **`src/tools/place-group-order.ts` (new):** `placeGroupOrder(config, args)`.
- **`src/medusa.ts` (modify):** add `createComgateCart(config, { items, metadata, customer }): Promise<{ cart_id, redirect_url }>` that composes the **standard store endpoints**: `POST /store/carts` (region + sales channel resolved as the existing client does) -> `POST /store/carts/:id/line-items` per item -> attach the free office shipping option (`GET /store/shipping-options?cart_id=...`, pick the zero-cost manual one, `POST /store/carts/:id/shipping-methods`) -> `POST /store/payment-collections` -> `GET /store/payment-providers?region_id=...` (pick the `comgate` one) -> `POST /store/payment-collections/:id/payment-sessions` with `provider_id` -> read `payment_sessions[0].data.redirect_url`. Returns it. (Response shapes verified against `website/src/utils/medusaSchemas.ts`.)
- **`src/server.ts` (modify):** register the two tools (zod input schemas) and update the server `instructions` to mention the group flow. Tool count goes 6 -> 8.
- **Reused unchanged:** `loadConfig`, `requestJson`, `getProducts`, `list_available_tuesdays`, `get_quote`, `get_jam_packs`, the stdio + HTTP entrypoints.

## Data flow

```
Organizer's AI:  create_group_order(office, date, address)
                       -> group_code  (+ share_message)
                       organizer sends the code to colleagues

Colleague's AI:  place_group_order(group_code, boxes, jam_addon, email, name)
                       -> Comgate cart on office channel (metadata.group_id = token)
                       -> pay_url (Comgate redirect)
                       colleague opens pay_url, pays by card
                       -> consumer /payment/return completes the cart -> order

Berry Servis:    orders Sheet groups every paid order by office + delivery_date;
                 manual 99 Kc fee link if an office is under 2 000 Kc at cutoff.
```

## Error handling

- Bad/garbled `group_code` -> clear "neplatny kod skupiny" error.
- Date not an open season Tuesday, or past Sunday 20:00 cutoff -> "skupina je uzavrena / termin neni dostupny".
- `boxes` outside 1-10, invalid email -> validation error listing the problems (mirror `request-strawberry-order.ts` style).
- Medusa/Comgate failure -> surface the `requestJson` error message; no partial state matters (an unpaid cart is harmless).
- Missing `redirect_url` in the payment session -> explicit error.

## Testing (vitest, mirror existing tests)

- `group-code.test.ts`: encode -> decode round-trip; decode returns null on garbage; token format/uniqueness.
- `cutoff.test.ts`: before/after Sunday 20:00 boundary for a known Tuesday.
- `place-group-order.test.ts`: validation rejects (bad code, closed date, 0 / 11 boxes, bad email); on valid input, `createComgateCart` is called with the right metadata and the tool returns `pay_url` (mock `medusa.ts`).
- `create-group-order.test.ts`: returns a decodable code echoing the inputs.
- Keep `npm run ci` green (lint + typecheck + vitest + build).

## Non-goals (v1) / future

- No office web colleague page (parked lean web spec).
- No `return_url` override (returns to consumer `/payment/return`); add later if a branded office return matters.
- No live tally / progress and no auto fee-link (would need the parked `Group` backend module).
- No multi-fruit catalog beyond strawberries + mini-jam (add raspberry/blackberry variants when in season).
- No auth on the public server (creating an unpaid cart is harmless; matches the existing public tools).

## Operational (make the advertised server real)

- **Deploy** the server at `mcp.berryservis.cz` (Streamable HTTP) so the site's claim is true; set `MEDUSA_BACKEND_URL` + `MEDUSA_OFFICE_PUBLISHABLE_KEY`.
- **Fix the site copy** in `office/src/sections/McpForDevelopers.tsx`: GitHub link is `berry-servis/mcp-strawberries` (hyphen), and the tool count becomes **8**. (Small office-repo follow-up, tracked separately.)
- Same go-live prerequisite as the web doors: the office channel must have the in-season products published and the origin allowed (the MCP uses the publishable key server-side, so CORS is not a blocker for it, but products must exist on the channel).
