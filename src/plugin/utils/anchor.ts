import { HVAlign } from "../../common/types";

/**
 * Returns the anchor point multipliers for positioning a station frame.
 * The anchor is the point on the frame that should sit at the station's computed position.
 *
 * textAlign describes where the station NAME text is, so the line dots are on the opposite side.
 * The frame's anchor is placed at the dot side so dots align with the bezier connection point.
 *
 * Returns { x, y } where 0 = left/top edge, 0.5 = center, 1 = right/bottom edge.
 */
export function getStationAnchorPoint(textAlign: HVAlign): { x: number; y: number } {
  switch (textAlign) {
    case 'right': return { x: 0, y: 0.5 }; // text right → dots left → anchor at left center
    case 'left':  return { x: 1, y: 0.5 }; // text left  → dots right → anchor at right center
    case 'bottom': return { x: 0.5, y: 0 }; // text below → dots above → anchor at top center
    case 'top':  return { x: 0.5, y: 1 }; // text above → dots below → anchor at bottom center
  }
}
