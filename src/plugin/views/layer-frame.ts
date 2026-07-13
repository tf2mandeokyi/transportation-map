// Every top-level render category (roads, junctions, lines, stations) lives inside its
// own single page-level frame instead of appending nodes directly to figma.currentPage.
// That turns "bring this whole category to front" into one appendChild of the frame,
// instead of a per-node loop/scan — the frame itself carries the category's entire
// z-order position on the page.
//
// The frame is found by its own `name` via a direct scene-graph scan, not by stashing its
// id in a separate plugin-data slot (figma.root's, or otherwise) — a stored pointer is one
// more place for identity to go stale, and in practice concurrent renderStation calls each
// creating their own "Stations" frame turned out to trace back to exactly that indirection.
// Scanning for the frame itself is also fully synchronous (findOne, not getNodeByIdAsync),
// so a get-or-create call runs start-to-finish in one JS turn with no `await` in between —
// no interleaving window for a concurrent Promise.all caller to slip through.
export const LINES_FRAME_NAME     = 'Lines';
export const ROADS_FRAME_NAME     = 'Roads';
export const JUNCTIONS_FRAME_NAME = 'Junctions';
export const STATIONS_FRAME_NAME  = 'Stations';

// `locked` defaults to true (matches Lines, whose contents are never directly
// selected/dragged by the user). Roads/Junctions/Stations pass `locked: false` — their
// contents are the actual drag/click targets for road/node/station editing, and locking
// the container would block normal click-selection of children nested inside it.
export function getOrCreateLayerFrame(name: string, opts: { locked?: boolean } = {}): FrameNode {
  const existing = figma.currentPage.findOne(n => n.type === 'FRAME' && n.name === name) as FrameNode | null;
  if (existing && !existing.removed) return existing;

  const frame = figma.createFrame();
  frame.name = name;
  frame.fills = [];
  frame.clipsContent = false;
  frame.locked = opts.locked ?? true;
  figma.currentPage.appendChild(frame);
  return frame;
}

// Re-appending the frame itself moves it (and everything inside it) to the top of the
// page's z-order — one appendChild regardless of how many nodes the category holds.
export function bringLayerFrameToFront(name: string, opts: { locked?: boolean } = {}): void {
  const frame = getOrCreateLayerFrame(name, opts);
  const parent = frame.parent;
  if (parent && 'appendChild' in parent) parent.appendChild(frame);
}
