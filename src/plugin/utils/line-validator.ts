import { Line } from "../models/structures";
import { Owned, own } from "@/common/utils/ownership";
import { PassStop, RoadSectionPass } from "../models/structures/line-path";

// Regenerates every pass's stop list: real stops (stops:true) are kept as authored,
// every other station in the pass's section becomes an (unchecked) pass-through
// candidate. A pass always spans its section's full physical extent — crossings only
// ever happen at a section's two real endpoints — so there's no boundary-uncertainty
// to compute here, unlike the old RSC-based model.
export function validateLinePaths(line: Line): Owned<RoadSectionPass>[] {
  // Preserve ranks of previously-generated pass-throughs so round-trips remain stable.
  // Key: "stationId:direction" — if a pass-through for the same station+direction is
  // re-generated, it gets its previously-normalized rank back instead of defaulting to 0.
  const savedPassRanks = new Map<string, number>();
  for (const pass of line.paths) {
    for (const stop of pass.stops) {
      if (!stop.stops) savedPassRanks.set(`${stop.station.id}:${pass.direction}`, stop.rank);
    }
  }

  return line.paths.map(pass => {
    const sorted = pass.section.getStationsSorted(pass.direction);
    const realByStation = new Map(pass.stops.filter(s => s.stops).map(s => [s.station, s]));
    const stops: PassStop[] = sorted.map(station => realByStation.get(station) ?? {
      station,
      stops: false,
      rank: savedPassRanks.get(`${station.id}:${pass.direction}`) ?? 0,
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
