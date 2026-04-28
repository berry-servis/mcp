// HTTP entrypoint for production (Railway). Uses Streamable HTTP transport,
// which supersedes the deprecated SSE-only transport while still supporting
// SSE streaming for server-to-client messages.

import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);

// One MCP server + one stateful transport, shared across requests. Stateful
// mode allows the SDK to manage session ids, suitable for the public MCP host.
const mcpServer = createServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});
await mcpServer.connect(transport);

const httpServer = createHttpServer(async (req, res) => {
  // Healthcheck for Railway / load balancers.
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.url?.startsWith('/mcp')) {
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
      }
      res.end('Internal Server Error');
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not Found');
});

httpServer.listen(PORT, () => {
  console.log(`mcp-strawberries listening on :${PORT} — POST /mcp, GET /health`);
});
