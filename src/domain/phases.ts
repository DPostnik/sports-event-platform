// ADR-0004 and ADR-0031: the phases of each sport. A sport that is not in the
// table has no phases. Adding phases for a sport is one new entry here.
const SPORT_PHASES = new Map<string, readonly string[]>([
  ["football", ["1st_half", "2nd_half"]],
  ["ice_hockey", ["1st_period", "2nd_period", "3rd_period"]],
]);

export function isPhaseOfSport(sport: string, phase: string): boolean {
  const phases = SPORT_PHASES.get(sport) ?? [];
  return phases.includes(phase);
}
