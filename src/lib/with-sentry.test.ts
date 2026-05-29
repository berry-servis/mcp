import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls: { tool: string; args: Record<string, unknown>; err: unknown }[] = [];
vi.mock('./sentry.js', () => ({
  captureToolError: (err: unknown, ctx: { tool: string; args: Record<string, unknown> }) =>
    calls.push({ tool: ctx.tool, args: ctx.args, err }),
}));

import { withSentry } from './with-sentry.js';

describe('withSentry', () => {
  beforeEach(() => { calls.length = 0; });

  it('passes a successful result through untouched and does not capture', async () => {
    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const wrapped = withSentry('get_quote', handler);
    const result = await wrapped({ boxes: 40 }, {} as never);
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(calls).toHaveLength(0);
  });

  it('captures with tool + scrubbed args, then re-throws (schema tool: args, extra)', async () => {
    const boom = new Error('backend 500');
    const wrapped = withSentry('request_strawberry_order', async () => { throw boom; });
    await expect(
      wrapped({ company_name: 'Acme', billing_email: 'a@b.cz', ico: '12345678', boxes: 40 }, {} as never)
    ).rejects.toBe(boom);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('request_strawberry_order');
    expect(calls[0].err).toBe(boom);
    expect(calls[0].args.company_name).toBe('[REDACTED]');
    expect(calls[0].args.billing_email).toBe('[REDACTED]');
    expect(calls[0].args.ico).toBe('[REDACTED]');
    expect(calls[0].args.boxes).toBe(40);
  });

  it('no-input tool: does NOT tag the SDK extra object as args', async () => {
    const boom = new Error('story failed');
    const wrapped = withSentry('get_berry_servis_story', async () => { throw boom; });
    // SDK calls handler(extra) — single arg that is the RequestHandlerExtra
    const fakeExtra = { authInfo: { token: 'secret' }, requestInfo: { headers: { cookie: 'x' } } } as never;
    await expect(wrapped(fakeExtra)).rejects.toBe(boom);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('get_berry_servis_story');
    expect(calls[0].args).toEqual({}); // extra must NOT be captured
  });
});
