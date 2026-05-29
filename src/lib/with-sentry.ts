import { captureToolError } from './sentry.js';
import { scrubArgs } from './scrub-args.js';

/**
 * Wraps a tool handler so any thrown error is captured in Sentry with a `tool`
 * tag and PII-scrubbed args, then RE-THROWN. Re-throwing is mandatory: the MCP
 * SDK catches it and returns its normal `{ isError: true }` result, so client
 * behaviour is unchanged while Sentry still sees the error.
 *
 * The SDK calls handler(args, extra) for tools with an inputSchema, and
 * handler(extra) for no-input tools. We only treat the first arg as tool args
 * when BOTH args and extra were passed (callArgs.length > 1); otherwise the
 * first arg is the SDK's RequestHandlerExtra (auth/request info) and must NOT
 * be tagged into Sentry.
 */
export function withSentry<A extends unknown[], R>(
  tool: string,
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...callArgs: A): Promise<R> => {
    try {
      return await handler(...callArgs);
    } catch (err) {
      const rawArgs = callArgs.length > 1 ? callArgs[0] : {};
      captureToolError(err, { tool, args: scrubArgs(rawArgs) });
      throw err;
    }
  };
}
