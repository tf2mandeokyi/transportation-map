import { Line } from "../models/structures";
import { Owned, own } from "@/common/utils/ownership";
import { PassStop, RoadSectionPass } from "../models/structures/line-path";

// Regenerates every pass's stop list: real stops (stops:true) are kept as authored,
// every other station in the pass's section becomes an (unchecked) pass-through
// candidate. A pass always spans its section's full physical extent — crossings only
// ever happen at a section's two real endpoints — so there's no boundary-uncertainty
// to compute here, unlike the old RSC-based model.
export function validateLinePaths(line: Line): Owned<RoadSectionPass>[] {
  return line.paths.map(pass => {
    const sorted = pass.section.getStationsSorted(pass.direction);
    // Reuse every previously-known stop (real or pass-through) as-is so ranks stay
    // stable across regeneration; only a station genuinely new to this pass's section
    // gets a fresh (unchecked) pass-through candidate defaulting to rank 0.
    const byStation = new Map(pass.stops.map(s => [s.station, s]));
    const stops: PassStop[] = sorted.map(station => byStation.get(station) ?? {
      station,
      stops: false,
      rank: 0,
    });

    const next = new RoadSectionPass();
    next.section = pass.section;
    next.direction = pass.direction;
    next.fromRank = pass.fromRank;
    next.toRank = pass.toRank;
    next.stops = stops;
    return own(next);
  });
}
