import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSentry, captureException, captureToolError, __resetSentryForTests, type SentrySdk } from './sentry.js';

function makeSdk() {
  return { init: vi.fn(), setTag: vi.fn(), captureException: vi.fn() } as unknown as SentrySdk & {
    init: ReturnType<typeof vi.fn>; setTag: ReturnType<typeof vi.fn>; captureException: ReturnType<typeof vi.fn>;
  };
}

describe('sentry init module', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    __resetSentryForTests();
    process.env = { ...OLD_ENV };
    delete process.env.SENTRY_DSN; delete process.env.SENTRY_ENVIRONMENT; delete process.env.RAILWAY_GIT_COMMIT_SHA;
  });
  afterEach(() => { process.env = OLD_ENV; __resetSentryForTests(); });

  it('is a no-op when SENTRY_DSN is unset', () => {
    const sdk = makeSdk();
    initSentry({ sdk });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(() => captureException(new Error('x'))).not.toThrow();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it('initializes with the locked config and repo tag when DSN is present', () => {
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'production';
    process.env.RAILWAY_GIT_COMMIT_SHA = 'deadbeef';
    const sdk = makeSdk();
    initSentry({ sdk });
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const cfg = sdk.init.mock.calls[0][0];
    expect(cfg).toMatchObject({
      dsn: 'https://abc@o0.ingest.sentry.io/1', environment: 'production',
      release: 'deadbeef', tracesSampleRate: 0, sendDefaultPii: false,
    });
    expect(sdk.setTag).toHaveBeenCalledWith('repo', 'mcp');
  });
  it('captureException forwards to the active sdk with extra', () => {
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const sdk = makeSdk();
    initSentry({ sdk });
    const err = new Error('boom');
    captureException(err, { tool: 'get_quote' });
    expect(sdk.captureException).toHaveBeenCalledWith(err, { extra: { tool: 'get_quote' } });
  });
});

describe('captureToolError', () => {
  it('attaches tool tag + args extra to the event at capture time', () => {
    __resetSentryForTests();
    process.env.SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    // Fake SDK that models withScope's scoped lifetime: captureException snapshots
    // ONLY what the active (forked) scope holds at the moment of capture.
    let snapshot: { tags: Record<string, unknown>; extras: Record<string, unknown> } | null = null;
    const scope = {
      tags: {} as Record<string, unknown>,
      extras: {} as Record<string, unknown>,
      setTag(k: string, v: unknown) { this.tags[k] = v; },
      setExtra(k: string, v: unknown) { this.extras[k] = v; },
    };
    const fakeSdk = {
      init() {}, setTag() {},
      withScope(cb: (s: typeof scope) => void) {
        scope.tags = {}; scope.extras = {};
        cb(scope);
        scope.tags = {}; scope.extras = {}; // revert on return, like the real SDK
      },
      captureException() {
        // snapshot the CURRENT scope state at capture time
        snapshot = { tags: { ...scope.tags }, extras: { ...scope.extras } };
      },
    } as unknown as SentrySdk;
    initSentry({ sdk: fakeSdk });
    captureToolError(new Error('boom'), { tool: 'place_group_order', args: { boxes: 40, ico: '[REDACTED]' } });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.tags.tool).toBe('place_group_order');
    expect(snapshot!.extras.args).toEqual({ boxes: 40, ico: '[REDACTED]' });
    delete process.env.SENTRY_DSN;
    __resetSentryForTests();
  });

  it('is a no-op when sentry is not initialized', () => {
    __resetSentryForTests();
    // Should not throw even with no active SDK
    expect(() => captureToolError(new Error('x'), { tool: 'get_quote', args: {} })).not.toThrow();
  });
});
