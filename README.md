# mcp-strawberries

An MCP server for ordering Czech strawberries from [Berry Servis](https://firmy.berryservis.cz). Lets an AI assistant browse Tuesday delivery slots, get a price quote, and place a B2B order — all gated by a customer-clicks-confirmation-link email.

## What it does

Six tools, all scoped to the firmy (B2B) sales channel of the Berry Servis Medusa backend:

| Tool | Purpose |
| --- | --- |
| `get_berry_servis_story` | Static company background, certifications, contact info |
| `list_available_tuesdays` | ISO Tuesday dates available this strawberry season |
| `get_quote` | Compute total CZK for `boxes` × box price (+ optional mini-jam) |
| `get_jam_packs` | List the three corporate jam pack products with B2B prices |
| `request_strawberry_order` | Create a *pending* strawberry order — customer confirms via emailed link within 24h |
| `request_jam_pack_order` | Create a pending jam-pack order — same email-confirmation gate, 5+ day lead time |

## Install — Claude Desktop (stdio)

After publishing to npm, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "berry-servis": {
      "command": "npx",
      "args": ["-y", "mcp-strawberries"],
      "env": {
        "MEDUSA_BACKEND_URL": "https://api.berryservis.cz",
        "MEDUSA_FIRMY_PUBLISHABLE_KEY": "pk_..."
      }
    }
  }
}
```

## Install — Cursor / any HTTP MCP client

Once deployed at a public URL:

```json
{
  "mcpServers": {
    "berry-servis": {
      "url": "https://mcp.berryservis.cz/mcp"
    }
  }
}
```

The hosted server uses **Streamable HTTP** transport (the current MCP HTTP standard, supersedes the SSE-only legacy transport).

## Local development

```bash
npm install
cp .env.example .env       # then fill in MEDUSA_BACKEND_URL + MEDUSA_FIRMY_PUBLISHABLE_KEY
npm run dev                # tsx watch
```

To smoke-test against Claude Desktop locally, point its config to `node /absolute/path/to/dist/stdio.js` after `npm run build`.

### Required environment

| Var | Required | Notes |
| --- | --- | --- |
| `MEDUSA_BACKEND_URL` | yes | e.g. `https://api.berryservis.cz` |
| `MEDUSA_FIRMY_PUBLISHABLE_KEY` | yes | Scoped to the `firmy` Medusa sales channel |
| `PORT` | no | HTTP entrypoint port, default `3000` |

## How an order flows

```
list_available_tuesdays → get_quote → request_strawberry_order
        ↓                                    ↓
        Tuesday picked                       Pending order in Medusa
                                                ↓
                                        Email to customer with confirm link
                                                ↓
                                        Customer clicks → order finalized
                                                ↓
                                        Driver delivers, invoice issued
```

The customer-clicks-the-link gate exists so an AI cannot place a real order without explicit human confirmation by the email recipient.

## Example transcript

> **User:** Order strawberries for 47 people on a Tuesday in mid-June.
>
> **AI** (calling `list_available_tuesdays`): Available Tuesdays mid-June are 2026-06-09, 2026-06-16, 2026-06-23.
>
> **AI** (calling `get_quote` with `boxes: 47, jam_addon: false`): That's 47 × box price = ... CZK total.
>
> **AI:** I have everything except the company name and IČO — can you share those plus the delivery address?
>
> *(user provides)*
>
> **AI** (calling `request_strawberry_order`): Order is pending. A confirmation link has been sent to billing@yourcompany.cz — click it within 24h to confirm.

## License

MIT.
