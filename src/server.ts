import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from './medusa.js';
import { getBerryServisStory } from './tools/get-story.js';
import { listAvailableTuesdays } from './tools/list-tuesdays.js';
import { getQuote } from './tools/get-quote.js';
import { getJamPacksList } from './tools/get-jam-packs.js';
import {
  requestStrawberryOrder,
  type RequestStrawberryOrderArgs,
} from './tools/request-strawberry-order.js';
import {
  requestJamPackOrder,
  type RequestJamPackOrderArgs,
} from './tools/request-jam-pack-order.js';

function jsonText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function createServer() {
  const server = new McpServer(
    { name: 'berry-servis', version: '0.1.0' },
    {
      instructions:
        'MCP server for Berry Servis — order Czech strawberries (Tuesday delivery in Prague during May–early July) or corporate jam packs year-round. Use get_berry_servis_story for context, list_available_tuesdays + get_quote to plan, then request_strawberry_order or request_jam_pack_order to place a pending order. The customer must click an emailed confirmation link within 24h.',
    }
  );

  server.registerTool(
    'get_berry_servis_story',
    {
      description: 'Get the Berry Servis company story, certifications, and contact info.',
      inputSchema: {},
    },
    async () => ({ content: [{ type: 'text', text: getBerryServisStory() }] })
  );

  server.registerTool(
    'list_available_tuesdays',
    {
      description:
        'List Tuesday delivery dates (ISO YYYY-MM-DD) available this strawberry season. Returns an empty list outside the season.',
      inputSchema: {},
    },
    async () => jsonText(listAvailableTuesdays())
  );

  server.registerTool(
    'get_quote',
    {
      description:
        'Estimate the total CZK price for a strawberry order. boxes is the number of 1 kg boxes (20–100), one per recipient. jam_addon adds a mini-jam jar to each box.',
      inputSchema: {
        boxes: z.number().int().min(20).max(100),
        jam_addon: z.boolean(),
      },
    },
    async (args) => {
      const config = loadConfig();
      return jsonText(await getQuote(config, args));
    }
  );

  server.registerTool(
    'get_jam_packs',
    {
      description:
        'List the three corporate jam pack products (Small/Medium/Large) with current B2B prices.',
      inputSchema: {},
    },
    async () => {
      const config = loadConfig();
      return jsonText(await getJamPacksList(config));
    }
  );

  server.registerTool(
    'request_strawberry_order',
    {
      description:
        'Request a strawberry delivery for a specific Tuesday in season. Creates a pending order — customer must click the confirmation link in the email sent to billing_email within 24h. Validates IČO (8 digits), Czech phone (+420 followed by 9 digits), email, and that the Tuesday is in season.',
      inputSchema: {
        company_name: z.string().min(1),
        ico: z.string(),
        dic: z.string().optional(),
        billing_email: z.string(),
        delivery_address: z.string().min(1),
        delivery_contact_name: z.string().min(1),
        delivery_contact_phone: z.string(),
        delivery_notes: z.string().optional(),
        boxes: z.number().int().min(20).max(100),
        tuesday: z.string().describe('ISO date (YYYY-MM-DD) of the chosen Tuesday'),
        jam_addon: z.boolean(),
      },
    },
    async (args) => {
      const config = loadConfig();
      return jsonText(await requestStrawberryOrder(config, args as RequestStrawberryOrderArgs));
    }
  );

  server.registerTool(
    'request_jam_pack_order',
    {
      description:
        'Request a corporate jam-pack delivery for any date with at least 5 days lead time. Creates a pending order — same email-confirmation gate as strawberry orders.',
      inputSchema: {
        company_name: z.string().min(1),
        ico: z.string(),
        dic: z.string().optional(),
        billing_email: z.string(),
        delivery_address: z.string().min(1),
        delivery_contact_name: z.string().min(1),
        delivery_contact_phone: z.string(),
        delivery_notes: z.string().optional(),
        pack_handle: z.enum([
          'korporatni-dzemy-small',
          'korporatni-dzemy-medium',
          'korporatni-dzemy-large',
        ]),
        pack_quantity: z.number().int().min(1),
        delivery_date: z.string().describe('ISO date (YYYY-MM-DD), at least 5 days from today'),
      },
    },
    async (args) => {
      const config = loadConfig();
      return jsonText(await requestJamPackOrder(config, args as RequestJamPackOrderArgs));
    }
  );

  return server;
}
