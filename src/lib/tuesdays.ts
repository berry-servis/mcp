// Strawberry season window (Czech): first Tuesday on/after May 12 through
// last Tuesday on/before July 7 of the given year.

const TUESDAY = 2; // 0=Sun, 1=Mon, 2=Tue, ...

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstTuesdayOnOrAfter(d: Date): Date {
  const out = new Date(d);
  while (out.getDay() !== TUESDAY) out.setDate(out.getDate() + 1);
  return out;
}

function lastTuesdayOnOrBefore(d: Date): Date {
  const out = new Date(d);
  while (out.getDay() !== TUESDAY) out.setDate(out.getDate() - 1);
  return out;
}

export function strawberrySeasonTuesdays(year: number): string[] {
  const start = firstTuesdayOnOrAfter(new Date(year, 4, 12)); // May 12
  const end = lastTuesdayOnOrBefore(new Date(year, 6, 7)); // July 7

  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export function upcomingStrawberryTuesdays(now: Date = new Date()): string[] {
  const all = strawberrySeasonTuesdays(now.getFullYear());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = toIsoDate(today);
  return all.filter((iso) => iso >= todayIso);
}

export function isStrawberrySeason(isoDate: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return false;
  const year = Number(m[1]);
  return strawberrySeasonTuesdays(year).includes(isoDate);
}
