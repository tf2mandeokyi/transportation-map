import { StationOrientation } from "../../common/types";

/**
 * Calculates the anchor point for a station based on its orientation and traffic direction.
 *
 * The anchor point determines which point of the station frame should be positioned at station.position.
 * Returns multipliers where:
 * - 0 = left/top edge
 * - 0.5 = center
 * - 1 = right/bottom edge
 *
 * @param orientation - The orientation of the station (LEFT, RIGHT, UP, DOWN)
 * @param isRightHandTraffic - Whether the map uses right-hand traffic
 * @returns An object with x and y multipliers for the anchor point
 */
export function getStationAnchorPoint(
  orientation: StationOrientation,
  isRightHandTraffic: boolean
): { x: number; y: number } {
  switch (orientation) {
    case 'RIGHT':
      // RIGHT: center,top if RHS; center,bottom if LHS
      return { x: 0.5, y: isRightHandTraffic ? 0 : 1 };
    case 'LEFT':
      // LEFT: center,bottom if RHS; center,top if LHS
      return { x: 0.5, y: isRightHandTraffic ? 1 : 0 };
    case 'UP':
      // UP: left,center if RHS; right,center if LHS
      return { x: isRightHandTraffic ? 0 : 1, y: 0.5 };
    case 'DOWN':
      // DOWN: right,center if RHS; left,center if LHS
      return { x: isRightHandTraffic ? 1 : 0, y: 0.5 };
  }
}
