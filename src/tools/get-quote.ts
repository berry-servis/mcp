import { getProducts, type MedusaConfig, type MedusaProduct } from '../medusa.js';

export interface QuoteResult {
  box_price_czk: number | null;
  addon_price_czk: number | null;
  total_czk: number | null;
  breakdown: string;
}

function priceCzk(product: MedusaProduct | undefined): number | null {
  const amount = product?.variants?.[0]?.calculated_price?.calculated_amount;
  if (amount == null) return null;
  return amount > 1000 ? Math.round(amount / 100) : Math.round(amount);
}

export async function getQuote(
  config: MedusaConfig,
  args: { boxes: number; jam_addon: boolean }
): Promise<QuoteResult> {
  if (args.boxes < 20 || args.boxes > 100) {
    throw new Error('boxes must be between 20 and 100');
  }
  const { products } = await getProducts(config);
  const box = products.find((p) => /jahod/i.test(p.handle ?? ''));
  const jam = products.find((p) => /(dzem|jam|mini)/i.test(p.handle ?? ''));

  const boxPrice = priceCzk(box);
  const jamPrice = priceCzk(jam);

  const total =
    boxPrice == null
      ? null
      : boxPrice * args.boxes + (args.jam_addon && jamPrice != null ? jamPrice * args.boxes : 0);

  const breakdown = [
    boxPrice != null ? `${args.boxes} × ${boxPrice} CZK box` : 'Box price unavailable',
    args.jam_addon && jamPrice != null
      ? `+ ${args.boxes} × ${jamPrice} CZK mini-jam`
      : null,
    total != null ? `= ${total} CZK total` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return { box_price_czk: boxPrice, addon_price_czk: jamPrice, total_czk: total, breakdown };
}
