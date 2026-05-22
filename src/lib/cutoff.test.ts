import { describe, it, expect } from 'vitest';
import { isPastCutoff } from './cutoff.js';

// Delivery Tuesday 2026-06-09 -> cutoff Monday 2026-06-08 10:00 (server local time).
describe('isPastCutoff', () => {
  it('is false well before the Monday cutoff', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-05T12:00:00'))).toBe(false);
  });
  it('is false at 09:59 on the Monday', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-08T09:59:00'))).toBe(false);
  });
  it('is true at 10:01 on the Monday', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-08T10:01:00'))).toBe(true);
  });
  it('is true on the delivery day', () => {
    expect(isPastCutoff('2026-06-09', new Date('2026-06-09T08:00:00'))).toBe(true);
  });
});
