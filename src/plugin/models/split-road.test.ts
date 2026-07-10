import { describe, it, expect } from 'vitest';
import { Model } from './index';
import { RoadSectionPass } from './structures';

// Straight-line road (bezierMidPoint at the exact midpoint) so eval(t) is a plain lerp
// and expected positions/interpT remaps are easy to reason about by hand.
function buildStraightRoad(model: Model) {
  const a = model.addNode({ position: { x: 0, y: 0 }, radius: 8 });
  const b = model.addNode({ position: { x: 100, y: 0 }, radius: 8 });
  const road = model.addRoad({
    bezierMidPoint: { x: 50, y: 0 },
    endpoints: [
      { node: a, horizontalOffset: 0, groupNumber: 0 } as never,
      { node: b, horizontalOffset: 0, groupNumber: 0 } as never,
    ],
  });
  const section = road.getSectionByIndex(0)!;
  return { a, b, road, section };
}

describe('Model.splitRoad', () => {
  it('preserves station physical positions across the split, remapping interpT per half', () => {
    const model = new Model();
    const { road, section } = buildStraightRoad(model);

    const s1 = model.addStation({
      name: 'S1', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false,
      interpT: 0.3, roadSection: section,
    });
    const s2 = model.addStation({
      name: 'S2', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false,
      interpT: 0.7, roadSection: section,
    });

    const posS1Before = s1.computePosition();
    const posS2Before = s2.computePosition();

    // A zero-radius junction node introduces no boundary inset of its own, so the curve
    // through the split point is geometrically identical to the original — isolating the
    // reparametrization math from the (separate, intentional) node-radius gap that a real
    // junction introduces.
    const splitNode = model.splitRoad(road, 0.5, 0);

    expect(splitNode.position.x).toBeCloseTo(50, 5);
    expect(splitNode.position.y).toBeCloseTo(0, 5);
    expect(model.state.getRoad(road.id)).toBeUndefined();

    // S1 (interpT 0.3) lands left of the split, S2 (interpT 0.7) lands right of it.
    expect(s1.parentRoadSection).not.toBe(section);
    expect(s2.parentRoadSection).not.toBe(section);
    expect(s1.parentRoadSection.parentRoad).not.toBe(s2.parentRoadSection.parentRoad);
    expect(s1.rawInterpT).toBeCloseTo(0.6, 5);  // 0.3 / 0.5
    expect(s2.rawInterpT).toBeCloseTo(0.4, 5);  // (0.7 - 0.5) / (1 - 0.5)

    const posS1After = s1.computePosition();
    const posS2After = s2.computePosition();
    expect(posS1After.x).toBeCloseTo(posS1Before.x, 5);
    expect(posS1After.y).toBeCloseTo(posS1Before.y, 5);
    expect(posS2After.x).toBeCloseTo(posS2Before.x, 5);
    expect(posS2After.y).toBeCloseTo(posS2Before.y, 5);
  });

  it('splits a single pass spanning both halves into two passes joined at the split node', () => {
    const model = new Model();
    const { road, section } = buildStraightRoad(model);

    const s1 = model.addStation({
      name: 'S1', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false,
      interpT: 0.3, roadSection: section,
    });
    const s2 = model.addStation({
      name: 'S2', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false,
      interpT: 0.7, roadSection: section,
    });

    const line = model.addLine({ name: 'Line 1', color: '#ff0000', isCircular: false, paths: [] });
    const pass = new RoadSectionPass();
    pass.section = section;
    pass.direction = 'ascending';
    pass.fromRank = 0;
    pass.toRank = 0;
    pass.stops = [{ station: s1, rank: 0, stops: true }, { station: s2, rank: 0, stops: true }];
    line.paths = [pass];

    const splitNode = model.splitRoad(road, 0.5, 8);

    expect(line.paths).toHaveLength(2);
    const [p1, p2] = line.paths;
    expect(p1.section).toBe(s1.parentRoadSection);
    expect(p2.section).toBe(s2.parentRoadSection);
    expect(p1.toNode).toBe(splitNode);
    expect(p2.fromNode).toBe(splitNode);
    expect(p1.stops.map(s => s.station.id)).toEqual([s1.id]);
    expect(p2.stops.map(s => s.station.id)).toEqual([s2.id]);
  });
});
