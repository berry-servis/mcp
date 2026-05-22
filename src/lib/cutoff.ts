/**
 * Ordering closes at 20:00 on the Sunday before the delivery Tuesday.
 * Times are server-local (Railway runs UTC; precise CZ-timezone handling is a future refinement).
 */
export function isPastCutoff(deliveryDateIso: string, now: Date = new Date()): boolean {
  const tuesday = new Date(`${deliveryDateIso}T00:00:00`);
  if (Number.isNaN(tuesday.getTime())) return true; // unparseable -> treat as closed
  const cutoff = new Date(tuesday);
  cutoff.setDate(tuesday.getDate() - 2); // Sunday
  cutoff.setHours(20, 0, 0, 0);
  return now.getTime() > cutoff.getTime();
}
