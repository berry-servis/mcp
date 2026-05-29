import * as SentryDefault from '@sentry/node';

export type SentrySdk = typeof SentryDefault;

let _activeSdk: SentrySdk | null = null;

/**
 * Env-gated Sentry init for the MCP server. No-op unless SENTRY_DSN is set.
 * Errors-only (tracesSampleRate 0), PII off, environment/release from platform
 * env, and a global `repo: "mcp"` tag so the future auto-remediation pipeline
 * can route issues to this repo.
 */
export function initSentry(deps: { sdk?: SentrySdk } = {}): void {
  const sdk = deps.sdk ?? SentryDefault;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  sdk.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    sampleRate: 1.0,
    sendDefaultPii: false,
  });
  sdk.setTag('repo', 'mcp');
  _activeSdk = sdk;
}

export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!_activeSdk) return;
  _activeSdk.captureException(err, extra ? { extra } : undefined);
}

export interface SentryScopeLike {
  setTag(key: string, value: unknown): void;
  setExtra(key: string, value: unknown): void;
}

/**
 * Runs `fn` against a fresh Sentry scope so tags/extra set inside it apply
 * only to the capture that follows. No-op (still runs `fn` against a throwaway
 * scope) when Sentry is not initialized, so callers can tag unconditionally.
 */
export function withSentryScope(fn: (scope: SentryScopeLike) => void): void {
  if (!_activeSdk) {
    fn({ setTag: () => {}, setExtra: () => {} });
    return;
  }
  _activeSdk.withScope((scope) => {
    fn({
      setTag: (k, v) => scope.setTag(k, v as never),
      setExtra: (k, v) => scope.setExtra(k, v),
    });
  });
}

// Test-only export for resetting module state between tests.
export function __resetSentryForTests(): void {
  _activeSdk = null;
}
