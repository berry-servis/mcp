export interface GroupParams {
  office: string;
  deliveryDate: string; // ISO YYYY-MM-DD
  address: string;
  token: string;
}

export function encodeGroupCode(p: GroupParams): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodeGroupCode(code: string): GroupParams | null {
  try {
    const obj = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Partial<GroupParams>;
    if (
      typeof obj.office === 'string' &&
      typeof obj.deliveryDate === 'string' &&
      typeof obj.address === 'string' &&
      typeof obj.token === 'string' &&
      obj.office && obj.deliveryDate && obj.address && obj.token
    ) {
      return { office: obj.office, deliveryDate: obj.deliveryDate, address: obj.address, token: obj.token };
    }
    return null;
  } catch {
    return null;
  }
}

export function generateGroupToken(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
