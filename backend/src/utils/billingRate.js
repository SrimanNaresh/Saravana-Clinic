// Tiered per-patient rate based on how many patients visited that day.
// Shared between the aggregate billing report and the per-patient bill list
// so both always agree on the same day's rate.
export function rateForCount(count) {
  if (count <= 10) return 2.00;
  if (count <= 25) return 1.50;
  return 1.00;
}
