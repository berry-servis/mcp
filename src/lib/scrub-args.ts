// PII fields that can appear in MCP tool inputs. Any arg with one of these
// keys is replaced with "[REDACTED]" before it is tagged onto a Sentry scope.
export const PII_ARG_KEYS = [
  'company_name', 'ico', 'dic', 'billing_email', 'delivery_address', 'address',
  'delivery_contact_name', 'delivery_contact_phone', 'delivery_notes',
  'contact_email', 'contact_name',
] as const;

const PII_KEY_SET: ReadonlySet<string> = new Set(PII_ARG_KEYS);
const REDACTED = '[REDACTED]';

/**
 * Returns a shallow copy of `args` with every PII field replaced by
 * "[REDACTED]". Does not mutate the input. Non-object input yields {}.
 */
export function scrubArgs(args: unknown): Record<string, unknown> {
  if (args == null || typeof args !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] = PII_KEY_SET.has(key) ? REDACTED : value;
  }
  return out;
}
