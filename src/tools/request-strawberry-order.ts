import { createPendingOrder, type MedusaConfig } from '../medusa.js';
import { isStrawberrySeason } from '../lib/tuesdays.js';

const ICO_RE = /^\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+420\s?)?\d{3}\s?\d{3}\s?\d{3}$/;

export interface RequestStrawberryOrderArgs {
  company_name: string;
  ico: string;
  dic?: string;
  billing_email: string;
  delivery_address: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  boxes: number;
  tuesday: string;
  jam_addon: boolean;
}

export interface OrderResult {
  order_id: string;
  message: string;
}

function validate(args: RequestStrawberryOrderArgs): void {
  const errors: string[] = [];
  if (!args.company_name?.trim()) errors.push('company_name is required');
  if (!ICO_RE.test(args.ico ?? '')) errors.push('ico must be 8 digits');
  if (!EMAIL_RE.test(args.billing_email ?? '')) errors.push('billing_email is not a valid email');
  if (!args.delivery_address?.trim()) errors.push('delivery_address is required');
  if (!args.delivery_contact_name?.trim()) errors.push('delivery_contact_name is required');
  if (!PHONE_RE.test(args.delivery_contact_phone ?? ''))
    errors.push('delivery_contact_phone must be a Czech phone (+420 followed by 9 digits)');
  if (!Number.isInteger(args.boxes) || args.boxes < 20 || args.boxes > 100)
    errors.push('boxes must be an integer between 20 and 100');
  if (!isStrawberrySeason(args.tuesday))
    errors.push('tuesday must be a Tuesday in the strawberry season (May 12 — July 7)');
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);
}

export async function requestStrawberryOrder(
  config: MedusaConfig,
  args: RequestStrawberryOrderArgs
): Promise<OrderResult> {
  validate(args);

  const items = [
    { variant_id: 'strawberry-box', quantity: args.boxes },
    ...(args.jam_addon ? [{ variant_id: 'mini-jam', quantity: args.boxes }] : []),
  ];

  const result = await createPendingOrder(config, {
    items,
    metadata: {
      ico: args.ico,
      dic: args.dic,
      delivery_tuesday: args.tuesday,
      delivery_contact_name: args.delivery_contact_name,
      delivery_contact_phone: args.delivery_contact_phone,
      delivery_address: args.delivery_address,
      delivery_notes: args.delivery_notes,
      jam_addon: args.jam_addon,
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
    message: `Order placed for ${args.company_name} (invoice). An order confirmation has been emailed to ${args.billing_email}. Delivery on ${args.tuesday} between 9:00 and 11:00; if overbooked, we'll contact you.`,
  };
}
