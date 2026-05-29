import { describe, it, expect } from 'vitest';
import { scrubArgs, PII_ARG_KEYS } from './scrub-args.js';

describe('scrubArgs', () => {
  it('redacts every known PII field', () => {
    const input = {
      company_name: 'Acme s.r.o.', ico: '12345678', dic: 'CZ12345678',
      billing_email: 'jana@acme.cz', delivery_address: 'Karlovo nam. 1, Praha',
      address: 'Karlovo nam. 1, Praha', delivery_contact_name: 'Jana Novakova',
      delivery_contact_phone: '+420 777 888 999', delivery_notes: 'leave at reception, call Jana',
      contact_email: 'kolega@acme.cz', contact_name: 'Petr',
      office: 'Acme HQ', group_code: 'eyJvZmZpY2UiOiJBY21lIn0',
    };
    const out = scrubArgs(input);
    for (const key of PII_ARG_KEYS) { expect(out[key]).toBe('[REDACTED]'); }
  });
  it('redacts office (customer company/office name)', () => {
    const out = scrubArgs({ office: 'Acme HQ', boxes: 3 });
    expect(out.office).toBe('[REDACTED]');
    expect(out.boxes).toBe(3);
  });
  it('redacts group_code (base64url bundle of office+address+token)', () => {
    const out = scrubArgs({ group_code: 'eyJvZmZpY2UiOiJBY21lIn0', boxes: 5 });
    expect(out.group_code).toBe('[REDACTED]');
    expect(out.boxes).toBe(5);
  });
  it('preserves non-PII fields verbatim', () => {
    const out = scrubArgs({
      boxes: 40, jam_addon: true, tuesday: '2026-06-09', pack_handle: 'korporatni-dzemy-small',
      pack_quantity: 2, delivery_date: '2026-06-09',
      billing_email: 'x@y.cz',
    });
    expect(out).toMatchObject({
      boxes: 40, jam_addon: true, tuesday: '2026-06-09', pack_handle: 'korporatni-dzemy-small',
      pack_quantity: 2, delivery_date: '2026-06-09',
    });
    expect(out.billing_email).toBe('[REDACTED]');
  });
  it('does not mutate the input object', () => {
    const input = { billing_email: 'a@b.cz', boxes: 20 };
    const out = scrubArgs(input);
    expect(input.billing_email).toBe('a@b.cz');
    expect(out).not.toBe(input);
  });
  it('redacts a PII key even when its value is empty/falsy', () => {
    const out = scrubArgs({ ico: '', boxes: 20 });
    expect(out.ico).toBe('[REDACTED]');
    expect(out.boxes).toBe(20);
  });
  it('tolerates non-object input', () => {
    expect(scrubArgs(undefined)).toEqual({});
    expect(scrubArgs(null)).toEqual({});
    expect(scrubArgs('nope' as unknown as Record<string, unknown>)).toEqual({});
  });
});
