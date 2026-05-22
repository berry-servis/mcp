import { describe, it, expect } from 'vitest';
import { mapEventsToOpenTuesdays, fetchOpenTuesdays } from './availability.js';

const now = new Date('2026-06-01T00:00:00');

describe('mapEventsToOpenTuesdays', () => {
  it('keeps all-day Tuesday events, drops timed / non-Tuesday / past, dedups + sorts', () => {
    const out = mapEventsToOpenTuesdays(
      [
        { start: { date: '2026-06-16' } },
        { start: { date: '2026-06-09' } },
        { start: { date: '2026-06-09' } },
        { start: { date: '2026-06-10' } },
        { start: { dateTime: '2026-06-09T08:00:00Z' } },
        { start: { date: '2026-05-12' } },
      ],
      now,
    );
    expect(out).toEqual(['2026-06-09', '2026-06-16']);
  });
});

describe('fetchOpenTuesdays', () => {
  it('falls back to season Tuesdays when unconfigured', async () => {
    const out = await fetchOpenTuesdays(new Date('2026-05-01'), { apiKey: '', calendarId: '' });
    expect(out).toContain('2026-06-09');
  });

  it('falls back to season Tuesdays when the fetch throws', async () => {
    const out = await fetchOpenTuesdays(new Date('2026-05-01'), {
      apiKey: 'k',
      calendarId: 'c',
      fetchFn: async () => {
        throw new Error('network');
      },
    });
    expect(out).toContain('2026-06-09');
  });

  it('returns mapped open Tuesdays on a successful response', async () => {
    const out = await fetchOpenTuesdays(now, {
      apiKey: 'k',
      calendarId: 'c',
      fetchFn: async () =>
        new Response(JSON.stringify({ items: [{ start: { date: '2026-06-09' } }, { start: { date: '2026-06-10' } }] }), {
          status: 200,
        }),
    });
    expect(out).toEqual(['2026-06-09']);
  });

  it('treats a successful empty response as authoritative', async () => {
    const out = await fetchOpenTuesdays(now, {
      apiKey: 'k',
      calendarId: 'c',
      fetchFn: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    });
    expect(out).toEqual([]);
  });
});
