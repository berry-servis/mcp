import { upcomingStrawberryTuesdays } from './tuesdays.js';

const TUESDAY = 2; // 0=Sun ... 2=Tue
const WINDOW_DAYS = 120;

export interface CalEvent {
  start?: { date?: string; dateTime?: string };
}

export interface FetchDeps {
  apiKey?: string;
  calendarId?: string;
  fetchFn?: typeof fetch;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Pure mapper: all-day events (those with `start.date`, not `start.dateTime`)
 * that fall on an upcoming Tuesday -> sorted, de-duplicated ISO dates.
 */
export function mapEventsToOpenTuesdays(items: CalEvent[], now: Date = new Date()): string[] {
  const todayIso = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const set = new Set<string>();
  for (const e of items) {
    const d = e.start?.date;
    if (!d) continue; // all-day only
    if (new Date(`${d}T00:00:00`).getDay() !== TUESDAY) continue;
    if (d < todayIso) continue;
    set.add(d);
  }
  return [...set].sort();
}

/** Open Tuesdays from the season window this year, or next year if currently off-season. */
export function seasonFallbackTuesdays(now: Date = new Date()): string[] {
  const upcoming = upcomingStrawberryTuesdays(now);
  if (upcoming.length > 0) return upcoming;
  const next = new Date(now.getFullYear() + 1, 0, 1);
  return upcomingStrawberryTuesdays(next);
}

/**
 * Open delivery Tuesdays, sourced from the public Google Calendar via the Calendar API.
 * Falls back to the season-Tuesday window when unconfigured or on any fetch error. A
 * successful (even empty) response is authoritative. Mirrors the office website reader so
 * both order paths show the same open dates.
 */
export async function fetchOpenTuesdays(now: Date = new Date(), deps: FetchDeps = {}): Promise<string[]> {
  const apiKey = deps.apiKey ?? process.env.GOOGLE_CALENDAR_API_KEY;
  const calendarId = deps.calendarId ?? process.env.GOOGLE_CALENDAR_ID;
  const fetchFn = deps.fetchFn ?? fetch;
  if (!apiKey || !calendarId) return seasonFallbackTuesdays(now);

  try {
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + WINDOW_DAYS * 86400000).toISOString();
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime`;
    const res = await fetchFn(url);
    if (!res.ok) return seasonFallbackTuesdays(now);
    const data = (await res.json()) as { items?: CalEvent[] };
    return mapEventsToOpenTuesdays(data.items ?? [], now);
  } catch {
    return seasonFallbackTuesdays(now);
  }
}
