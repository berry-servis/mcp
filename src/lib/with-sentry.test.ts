import { describe, it, expect, beforeEach, vi } from 'vitest';

const captured: { scope: Record<string, unknown> | null; err: unknown } = { scope: null, err: null };

vi.mock('./sentry.js', () => {
  return {
    withSentryScope: (fn: (scope: { setTag: (k: string, v: unknown) => void; setExtra: (k: string, v: unknown) => void }) => void) => {
      const bag: Record<string, unknown> = {};
      fn({ setTag: (k, v) => { bag[`tag:${k}`] = v; }, setExtra: (k, v) => { bag[`extra:${k}`] = v; } });
      captured.scope = bag;
    },
    captureException: (err: unknown) => { captured.err = err; },
  };
});

import { withSentry } from './with-sentry.js';

describe('withSentry', () => {
  beforeEach(() => { captured.scope = null; captured.err = null; });

  it('passes a successful result through untouched', async () => {
    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const wrapped = withSentry('get_quote', handler);
    const result = await wrapped({ boxes: 40 }, {} as never);
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(captured.err).toBeNull();
  });

  it('captures + tags tool + scrubbed args, then re-throws', async () => {
    const boom = new Error('backend 500');
    const handler = vi.fn(async () => { throw boom; });
    const wrapped = withSentry('request_strawberry_order', handler);
    await expect(
      wrapped({ company_name: 'Acme', billing_email: 'a@b.cz', ico: '12345678', boxes: 40 }, {} as never)
    ).rejects.toBe(boom);
    expect(captured.err).toBe(boom);
    expect(captured.scope).toMatchObject({ 'tag:tool': 'request_strawberry_order' });
    const taggedArgs = captured.scope?.['extra:args'] as Record<string, unknown>;
    expect(taggedArgs.company_name).toBe('[REDACTED]');
    expect(taggedArgs.billing_email).toBe('[REDACTED]');
    expect(taggedArgs.ico).toBe('[REDACTED]');
    expect(taggedArgs.boxes).toBe(40);
  });

  it('works for a no-input tool (extra is the first arg)', async () => {
    const boom = new Error('story failed');
    const handler = vi.fn(async () => { throw boom; });
    const wrapped = withSentry('get_berry_servis_story', handler);
    await expect(wrapped({} as never)).rejects.toBe(boom);
    expect(captured.scope).toMatchObject({ 'tag:tool': 'get_berry_servis_story' });
  });
});
