import { upcomingStrawberryTuesdays } from '../lib/tuesdays.js';

export interface ListTuesdaysResult {
  tuesdays: string[];
  note: string;
}

export function listAvailableTuesdays(): ListTuesdaysResult {
  return {
    tuesdays: upcomingStrawberryTuesdays(),
    note: "Capacity is soft — we'll contact you if a Tuesday gets overbooked.",
  };
}
