import { isStrawberrySeason } from '../lib/tuesdays.js';
import { encodeGroupCode, generateGroupToken } from '../lib/group-code.js';

export interface CreateGroupOrderArgs {
  office: string;
  delivery_date: string; // ISO Tuesday
  address: string;
}

export interface CreateGroupOrderResult {
  group_code: string;
  office: string;
  delivery_date: string;
  share_message: string;
}

export function createGroupOrder(args: CreateGroupOrderArgs): CreateGroupOrderResult {
  const errors: string[] = [];
  if (!args.office?.trim()) errors.push('office is required');
  if (!args.address?.trim()) errors.push('address is required (Prague only)');
  if (!isStrawberrySeason(args.delivery_date))
    errors.push('delivery_date must be a Tuesday in the strawberry season (May 12 - July 7)');
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);

  const office = args.office.trim();
  const token = generateGroupToken();
  const group_code = encodeGroupCode({
    office,
    deliveryDate: args.delivery_date,
    address: args.address.trim(),
    token,
  });

  const share_message =
    `Skupinova objednavka jahod do kancelare ${office}, rozvoz ${args.delivery_date}. ` +
    `Kazdy si objedna a zaplati sam pres AI asistenta pomoci tohoto kodu: ${group_code} ` +
    `(nastroj place_group_order). Doprava zdarma nad 2000 Kc, jinak 99 Kc hradi organizator.`;

  return { group_code, office, delivery_date: args.delivery_date, share_message };
}
