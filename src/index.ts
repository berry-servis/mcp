// HTTP entrypoint for production (Railway). Uses Streamable HTTP transport in
// stateless mode: a fresh MCP server + transport per request. This supports any
// number of independent clients (each tool call is self-contained), avoiding the
// single-shared-session limit of a long-lived transport.

import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { initSentry } from './lib/sentry.js';

initSentry();

const PORT = Number(process.env.PORT ?? 3000);

const httpServer = createHttpServer(async (req, res) => {
  // Healthcheck for Railway / load balancers.
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.url?.startsWith('/mcp')) {
    if (req.method !== 'POST') {
      // Stateless mode has no standalone SSE stream; clients only POST.
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method Not Allowed' }, id: null }));
      return;
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
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
  console.log(`mcp listening on :${PORT} - POST /mcp, GET /health`);
});
