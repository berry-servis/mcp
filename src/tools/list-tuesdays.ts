import { fetchOpenTuesdays } from '../lib/availability.js';

export interface ListTuesdaysResult {
  tuesdays: string[];
  note: string;
}

export async function listAvailableTuesdays(): Promise<ListTuesdaysResult> {
  return {
    tuesdays: await fetchOpenTuesdays(),
    note: "Capacity is soft — we'll contact you if a Tuesday gets overbooked.",
  };
}
