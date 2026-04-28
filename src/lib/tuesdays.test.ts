import { describe, it, expect } from 'vitest';
import { upcomingStrawberryTuesdays, isStrawberrySeason } from './tuesdays';

describe('upcomingStrawberryTuesdays', () => {
  it('returns the 9 Tuesdays from May 12 through early July in 2026', () => {
    const tuesdays = upcomingStrawberryTuesdays(new Date('2026-05-01'));
    expect(tuesdays).toEqual([
      '2026-05-12',
      '2026-05-19',
      '2026-05-26',
      '2026-06-02',
      '2026-06-09',
      '2026-06-16',
      '2026-06-23',
      '2026-06-30',
      '2026-07-07',
    ]);
  });
  it('returns only future Tuesdays when called mid-season', () => {
    const tuesdays = upcomingStrawberryTuesdays(new Date('2026-06-15'));
    expect(tuesdays[0]).toBe('2026-06-16');
  });
  it('returns empty array when called outside season', () => {
    expect(upcomingStrawberryTuesdays(new Date('2026-10-01'))).toEqual([]);
  });
});

describe('isStrawberrySeason', () => {
  it('true for season Tuesdays', () => {
    expect(isStrawberrySeason('2026-06-09')).toBe(true);
  });
  it('false for non-Tuesday dates', () => {
    expect(isStrawberrySeason('2026-06-08')).toBe(false);
  });
  it('false for off-season dates', () => {
    expect(isStrawberrySeason('2026-08-04')).toBe(false);
  });
});
