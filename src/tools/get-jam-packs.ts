import { getJamPacks, type MedusaConfig } from '../medusa.js';

export interface JamPackInfo {
  handle: string;
  name: string;
  jars: number;
  price_czk: number | null;
}

const PACK_JAR_COUNTS: Record<string, number> = {
  'korporatni-dzemy-small': 10,
  'korporatni-dzemy-medium': 30,
  'korporatni-dzemy-large': 50,
};

export async function getJamPacksList(config: MedusaConfig): Promise<JamPackInfo[]> {
  const { products } = await getJamPacks(config);
  return products.map((p) => {
    const amount = p.variants?.[0]?.calculated_price?.calculated_amount;
    const price =
      amount == null ? null : amount > 1000 ? Math.round(amount / 100) : Math.round(amount);
    return {
      handle: p.handle,
      name: p.title,
      jars: PACK_JAR_COUNTS[p.handle] ?? 0,
      price_czk: price,
    };
  });
}
