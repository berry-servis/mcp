import { createComgateCart, type MedusaConfig } from '../medusa.js';
import { decodeGroupCode } from '../lib/group-code.js';
import { fetchOpenTuesdays } from '../lib/availability.js';
import { isPastCutoff } from '../lib/cutoff.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PlaceGroupOrderArgs {
  group_code: string;
  boxes: number;
  jam_addon: boolean;
  contact_email: string;
  contact_name: string;
}

export interface PlaceGroupOrderResult {
  pay_url: string;
  message: string;
}

export async function placeGroupOrder(
  config: MedusaConfig,
  args: PlaceGroupOrderArgs
): Promise<PlaceGroupOrderResult> {
  const group = decodeGroupCode(args.group_code);
  if (!group) throw new Error('Neplatny kod skupiny (group_code).');

  const errors: string[] = [];
  const open = await fetchOpenTuesdays();
  if (!open.includes(group.deliveryDate)) errors.push('group delivery date is not an open delivery Tuesday');
  if (isPastCutoff(group.deliveryDate)) errors.push('this group is closed (past the Monday 10:00 cutoff)');
  if (!Number.isInteger(args.boxes) || args.boxes < 1) errors.push('boxes must be an integer >= 1');
  if (!EMAIL_RE.test(args.contact_email ?? '')) errors.push('contact_email is not a valid email');
  if (!args.contact_name?.trim()) errors.push('contact_name is required');
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);

  const { redirect_url } = await createComgateCart(config, {
    boxes: args.boxes,
    jamAddon: args.jam_addon,
    metadata: {
      group_id: group.token,
      office: group.office,
      delivery_date: group.deliveryDate,
      delivery_address: group.address,
      contact_name: args.contact_name.trim(),
    },
    customerEmail: args.contact_email,
    contactName: args.contact_name.trim(),
  });

  return {
    pay_url: redirect_url,
    message:
      `Otevrete odkaz a zaplatte kartou: ${redirect_url}. ` +
      `Po zaplaceni je objednavka potvrzena. Rozvoz ${group.deliveryDate} dopoledne do kancelare ${group.office}.`,
  };
}
