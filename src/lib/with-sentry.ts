import { captureException, withSentryScope } from './sentry.js';
import { scrubArgs } from './scrub-args.js';

// The SDK calls handler(args, extra) for tools with an inputSchema, and
// handler(extra) for no-input tools. We treat the first positional arg as the
// (possibly args) object and scrub it; scrubArgs tolerates the extra object too.
type ToolHandler = (...args: any[]) => Promise<any>;

/**
 * Wraps a tool handler so any thrown error is captured in Sentry with a `tool`
 * tag and PII-scrubbed args, then RE-THROWN. Re-throwing is mandatory: the MCP
 * SDK catches it and returns its normal `{ isError: true }` result, so client
 * behaviour is unchanged while Sentry still sees the error (which it otherwise
 * never would — the SDK swallows tool throws).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentry<T extends ToolHandler>(tool: string, handler: T): any {
  const wrapped = (async (...callArgs: unknown[]) => {
    try {
      return await handler(...callArgs);
    } catch (err) {
      const rawArgs = callArgs[0];
      withSentryScope((scope) => {
        scope.setTag('tool', tool);
        scope.setExtra('args', scrubArgs(rawArgs));
      });
      captureException(err, { tool });
      throw err;
    }
  }) as T;
  return wrapped;
}
