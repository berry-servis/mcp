import { createPendingOrder, type MedusaConfig } from '../medusa.js';

const ICO_RE = /^\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+420\s?)?\d{3}\s?\d{3}\s?\d{3}$/;
const JAM_PACK_LEAD_DAYS = 5;

const VALID_HANDLES = new Set([
  'korporatni-dzemy-small',
  'korporatni-dzemy-medium',
  'korporatni-dzemy-large',
]);

export interface RequestJamPackOrderArgs {
  company_name: string;
  ico: string;
  dic?: string;
  billing_email: string;
  delivery_address: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  pack_handle: string;
  pack_quantity: number;
  delivery_date: string;
}

export interface OrderResult {
  order_id: string;
  message: string;
}

function validate(args: RequestJamPackOrderArgs, now: Date = new Date()): void {
  const errors: string[] = [];
  if (!args.company_name?.trim()) errors.push('company_name is required');
  if (!ICO_RE.test(args.ico ?? '')) errors.push('ico must be 8 digits');
  if (!EMAIL_RE.test(args.billing_email ?? '')) errors.push('billing_email is not a valid email');
  if (!args.delivery_address?.trim()) errors.push('delivery_address is required');
  if (!args.delivery_contact_name?.trim()) errors.push('delivery_contact_name is required');
  if (!PHONE_RE.test(args.delivery_contact_phone ?? ''))
    errors.push('delivery_contact_phone must be a Czech phone (+420 followed by 9 digits)');

  if (!VALID_HANDLES.has(args.pack_handle))
    errors.push(`pack_handle must be one of ${[...VALID_HANDLES].join(', ')}`);
  if (!Number.isInteger(args.pack_quantity) || args.pack_quantity < 1)
    errors.push('pack_quantity must be a positive integer');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.delivery_date ?? '')) {
    errors.push('delivery_date must be ISO YYYY-MM-DD');
  } else {
    const target = new Date(`${args.delivery_date}T00:00:00`);
    const min = new Date(now);
    min.setHours(0, 0, 0, 0);
    min.setDate(min.getDate() + JAM_PACK_LEAD_DAYS);
    if (target.getTime() < min.getTime())
      errors.push(`delivery_date must be at least ${JAM_PACK_LEAD_DAYS} days out`);
  }

  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);
}

export async function requestJamPackOrder(
  config: MedusaConfig,
  args: RequestJamPackOrderArgs
): Promise<OrderResult> {
  validate(args);

  const result = await createPendingOrder(config, {
    items: [{ variant_id: args.pack_handle, quantity: args.pack_quantity }],
    metadata: {
      ico: args.ico,
      dic: args.dic,
      delivery_tuesday: args.delivery_date,
      delivery_contact_name: args.delivery_contact_name,
      delivery_contact_phone: args.delivery_contact_phone,
      delivery_address: args.delivery_address,
      delivery_notes: args.delivery_notes,
      company_name: args.company_name,
    },
    customer: {
      email: args.billing_email,
      name: args.delivery_contact_name,
      phone: args.delivery_contact_phone,
    },
  });

  return {
    order_id: result.order_id,
    message: `Pending — confirmation email sent to ${args.billing_email}. Click the link within 24h to confirm. We'll deliver on ${args.delivery_date}.`,
  };
}
