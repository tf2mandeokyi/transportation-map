import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId } from '@/common/types';
import { RoadSectionData } from '@/common/messages';
import { useMessageManager } from '../../contexts/MessageContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';

interface RseAddingPanelProps {
  afterPathIndex: number;
  sourceRoadId: RoadId | null;
  exitingSectionId: RoadSectionId | null;
  // When set, the very first crossing is already known (e.g. closing an
  // invalid-jump gap, where the prior RSE's node pins down the only physical
  // way to leave the source road) — no need to prompt for it.
  knownStartNodeId?: NodeId | null;
  // When set, the added chain must end at this node before it can be
  // committed (e.g. the node of the RSE right after an invalid-jump gap).
  requiredEndNodeId?: NodeId | null;
  onCommitRses: (
    afterPathIndex: number,
    entries: Array<{ nodeId: NodeId; exitingSectionId: RoadSectionId | null; enteringSectionId: RoadSectionId | null }>
  ) => void;
  onCancel: () => void;
}

type NodeOption = { nodeId: NodeId; nodeName: string };

type PendingRse = {
  destRoadId: RoadId;
  destRoadName: string | undefined;
  isUturn: boolean;
  // True for the very first entry of a brand-new path: there's no prior road to cross
  // from, so the user just picks which end of the clicked road they're starting at —
  // no shared-junction requirement, no "exiting" section.
  isStart: boolean;
  // Effective options/selection, possibly narrowed by a later entry (see narrowBackward).
  nodeOptions: NodeOption[];
  // The full set as originally computed for this entry, before any backward narrowing —
  // restored on removeEntry so removing the later entry that caused the narrowing doesn't
  // leave this one stuck on a since-invalidated inference.
  originalNodeOptions: NodeOption[];
  sections: RoadSectionData[];
  selectedNodeId: string;
  // True when selectedNodeId was inferred (single option to begin with, or narrowed from
  // a later entry) rather than explicitly picked by the user — only auto-resolved
  // selections get reverted by removeEntry.
  nodeAutoResolved: boolean;
  selectedSectionIdx: string;
};

// A road has exactly two physical endpoints, so once we know which one a later entry
// crosses at, an earlier still-ambiguous entry on that same road can only mean the
// other one. Walks backward from `fromIndex`, narrowing (and re-cascading) as far as
// the chain of two-way ambiguity actually reaches; stops at the first entry that's
// already resolved (by the user or otherwise) or whose options don't include the
// pinned node.
function narrowBackward(list: PendingRse[], fromIndex: number, pinnedNodeId: string): PendingRse[] {
  const next = [...list];
  let pinned = pinnedNodeId;
  for (let i = fromIndex - 1; i >= 0; i--) {
    const entry = next[i];
    if (entry.selectedNodeId !== '') break;
    if (entry.nodeOptions.length !== 2) break;
    const other = entry.nodeOptions.find(o => o.nodeId !== pinned);
    if (!other || !entry.nodeOptions.some(o => o.nodeId === pinned)) break;
    next[i] = { ...entry, nodeOptions: [other], selectedNodeId: other.nodeId, nodeAutoResolved: true };
    pinned = other.nodeId;
  }
  return next;
}

const RseAddingPanel: React.FC<RseAddingPanelProps> = ({
  afterPathIndex, sourceRoadId, exitingSectionId, knownStartNodeId = null, requiredEndNodeId = null, onCommitRses, onCancel,
}) => {
  const manager = useMessageManager();
  const { roads, nodes } = useNetworkContext();

  const [error, setError] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<PendingRse[]>([]);

  const pendingListRef = useRef<PendingRse[]>([]);
  useEffect(() => { pendingListRef.current = pendingList; }, [pendingList]);

  const handleRef = useRef<(destRoadId: RoadId, sectionId: RoadSectionId | null) => void>(() => {});
  handleRef.current = (destRoadId: RoadId, sectionId: RoadSectionId | null) => {
    const list = pendingListRef.current;
    const currentRoadId = list.length > 0 ? list[list.length - 1].destRoadId : sourceRoadId;
    const destRoad = roads.find(r => r.id === destRoadId);
    if (!destRoad) return;

    setError(null);

    const sectionIdx = sectionId ? destRoad.sections.findIndex(s => s.id[1] === sectionId[1]) : -1;
    const selectedSectionIdx = sectionIdx >= 0 ? String(sectionIdx) : '';

    // Deduped by node id: a road whose two endpoints are the same node (a self-loop)
    // isn't actually ambiguous — both "options" are the same choice — so it collapses
    // to a single guessable entry instead of forcing a pointless pick.
    const uniqueNodeOptions = (nodeIds: NodeId[]): NodeOption[] => {
      const seen = new Set<NodeId>();
      const result: NodeOption[] = [];
      for (const nodeId of nodeIds) {
        if (seen.has(nodeId)) continue;
        seen.add(nodeId);
        result.push({ nodeId, nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId });
      }
      return result;
    };

    // For the very first entry, the caller may already know which node it must
    // cross at (see knownStartNodeId) — narrow straight to it instead of asking,
    // the same way narrowBackward narrows an entry once a later one pins it down.
    const applyKnownStart = (options: NodeOption[]): NodeOption[] => {
      if (list.length !== 0 || !knownStartNodeId) return options;
      const known = options.find(o => o.nodeId === knownStartNodeId);
      return known ? [known] : options;
    };

    // Appends the new entry and, if its node came out immediately resolved, narrows
    // any still-ambiguous earlier entries it constrains (see narrowBackward).
    const pushEntry = (entry: Omit<PendingRse, 'originalNodeOptions' | 'nodeAutoResolved'>) => {
      const full: PendingRse = { ...entry, originalNodeOptions: entry.nodeOptions, nodeAutoResolved: entry.selectedNodeId !== '' };
      setPendingList(prev => {
        const withNew = [...prev, full];
        return full.selectedNodeId ? narrowBackward(withNew, withNew.length - 1, full.selectedNodeId) : withNew;
      });
    };

    if (list.length === 0 && !sourceRoadId) {
      // Starting a brand-new path: nothing to cross from yet, so just pick which end
      // of the clicked road to start at — no shared-junction requirement.
      const nodeOptions = applyKnownStart(uniqueNodeOptions([destRoad.startNodeId, destRoad.endNodeId]));
      pushEntry({
        destRoadId,
        destRoadName: destRoad.name,
        isUturn: false,
        isStart: true,
        nodeOptions,
        sections: destRoad.sections,
        selectedNodeId: nodeOptions.length === 1 ? nodeOptions[0].nodeId : '',
        selectedSectionIdx,
      });
      return;
    }

    if (currentRoadId === destRoadId) {
      // U-turn on same road
      const nodeOptions = applyKnownStart(uniqueNodeOptions([destRoad.startNodeId, destRoad.endNodeId]));
      pushEntry({
        destRoadId,
        destRoadName: destRoad.name,
        isUturn: true,
        isStart: false,
        nodeOptions,
        sections: destRoad.sections,
        selectedNodeId: nodeOptions.length === 1 ? nodeOptions[0].nodeId : '',
        selectedSectionIdx,
      });
      return;
    }

    if (!currentRoadId) {
      setError('No road context at this position.');
      return;
    }

    const sourceRoad = roads.find(r => r.id === currentRoadId);
    if (!sourceRoad) return;

    const sourceNodeIds = new Set([sourceRoad.startNodeId, sourceRoad.endNodeId]);
    const sharedNodes = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[])
      .filter(n => sourceNodeIds.has(n))
      .map(nodeId => ({ nodeId, nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId }));

    if (sharedNodes.length === 0) {
      setError('Roads are not directly connected by a shared junction.');
      return;
    }

    const nodeOptions = applyKnownStart(sharedNodes);

    pushEntry({
      destRoadId,
      destRoadName: destRoad.name,
      isUturn: false,
      isStart: false,
      nodeOptions,
      sections: destRoad.sections,
      selectedNodeId: nodeOptions.length === 1 ? nodeOptions[0].nodeId : '',
      selectedSectionIdx,
    });
  };

  useEffect(() => {
    return manager.onMessage('road-clicked', msg => handleRef.current(msg.roadId, msg.sectionId));
  }, [manager]);

  const updateEntry = (index: number, patch: Partial<Pick<PendingRse, 'selectedNodeId' | 'selectedSectionIdx'>>) => {
    setPendingList(prev => {
      const updated = prev.map((e, i) => i === index ? { ...e, ...patch, nodeAutoResolved: 'selectedNodeId' in patch ? false : e.nodeAutoResolved } : e);
      return patch.selectedNodeId ? narrowBackward(updated, index, patch.selectedNodeId) : updated;
    });
  };

  // Removing entry n also removes all entries after it since the road chain is invalidated.
  // If the new last entry's node was only auto-resolved because of what's being removed,
  // its ambiguity is no longer real — revert it to its original, un-narrowed options
  // rather than leaving it stuck on an inference that no longer holds.
  const removeEntry = (index: number) => {
    setPendingList(prev => {
      const sliced = prev.slice(0, index);
      const lastIdx = sliced.length - 1;
      const last = sliced[lastIdx];
      if (last?.nodeAutoResolved && last.originalNodeOptions.length > 1) {
        sliced[lastIdx] = { ...last, nodeOptions: last.originalNodeOptions, selectedNodeId: '', nodeAutoResolved: false };
      }
      return sliced;
    });
  };

  const handleCommit = () => {
    const list = pendingListRef.current;
    const entries = list.map((entry, i) => {
      const nodeId = entry.selectedNodeId as NodeId;
      const idx = parseInt(entry.selectedSectionIdx, 10);
      const enteringSectionId = entry.sections[idx]?.id ?? null;
      const prevEntry = list[i - 1];
      const prevIdx = prevEntry ? parseInt(prevEntry.selectedSectionIdx, 10) : -1;
      const exiting = i === 0
        ? exitingSectionId
        : (prevEntry?.sections[prevIdx]?.id ?? null);
      return { nodeId, exitingSectionId: exiting, enteringSectionId };
    });
    onCommitRses(afterPathIndex, entries);
  };

  // A road only ever has two physical endpoints, no matter how many sections it has —
  // sections are lateral lane bands along the same curve, not sequential stretches of
  // it (see RoadSection.computeOffset). So once the last entry's own entering node is
  // known, the node reached by continuing straight through its road is already fully
  // determined: it's just that road's other endpoint. This is the same computation
  // `handleRef` runs when an actual next entry is added — done a step early here, purely
  // for display, so the "open end" isn't shown as unknown when it demonstrably isn't.
  const lastEntry = pendingList[pendingList.length - 1];
  const lastRoad = lastEntry ? roads.find(r => r.id === lastEntry.destRoadId) : undefined;
  const impliedNextNode = lastRoad && lastEntry?.selectedNodeId
    ? nodes.find(n => n.id === (lastRoad.startNodeId === lastEntry.selectedNodeId ? lastRoad.endNodeId : lastRoad.startNodeId))
    : undefined;

  // When closing an invalid-jump gap, the chain isn't done just because every entry
  // is filled in — it has to actually reach the node the existing path resumes at.
  // impliedNextNode is exactly that "if you kept going straight, you'd land here"
  // node, so comparing it against requiredEndNodeId catches a chain that's complete
  // but wanders off to the wrong junction.
  const reachedRequiredEnd = !requiredEndNodeId || impliedNextNode?.id === requiredEndNodeId;

  const canCommit = pendingList.length > 0 &&
    pendingList.every(e => !!e.selectedNodeId && e.selectedSectionIdx !== '') &&
    reachedRequiredEnd;

  const requiredEndNode = requiredEndNodeId ? nodes.find(n => n.id === requiredEndNodeId) : undefined;

  return (
    <div className="mt-2 rounded border-2 border-[#18a0fb] bg-neutral-100 p-3">
      <p className="mb-2 text-[11px] text-neutral-500">
        <strong>Adding roads</strong><br />
        Click roads on the canvas. Click the same road to add a U-turn.
        {requiredEndNode && <> Must reconnect at <strong>{requiredEndNode.name ?? requiredEndNode.id}</strong>.</>}
      </p>

      {error && (
        <div className="mb-2 rounded border border-red-500 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {/* Rendered as an alternating chain — node, section, node, section, …, node —
          instead of one card per road, so it's visible that "node" and "section"
          are separate waypoints in a single sequence rather than a paired unit. */}
      {pendingList.map((entry, i) => {
        const nodeLabel = entry.isStart ? 'Starting end' : entry.isUturn ? 'Endpoint node' : 'Junction node';
        const sectionIdx = parseInt(entry.selectedSectionIdx, 10);
        const section = entry.sections[sectionIdx];

        return (
          <React.Fragment key={i}>
            <div className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-2 py-1.5">
              <span className="text-sm">{entry.isStart ? '●' : entry.isUturn ? '↩' : '↪'}</span>
              {entry.nodeOptions.length > 1 ? (
                <select
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-[11px]"
                  value={entry.selectedNodeId}
                  onChange={e => updateEntry(i, { selectedNodeId: e.target.value })}
                >
                  <option value="">— {nodeLabel.toLowerCase()} —</option>
                  {entry.nodeOptions.map(opt => (
                    <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
                  ))}
                </select>
              ) : (
                <span className="flex-1 text-xs font-medium">
                  {entry.nodeOptions[0]?.nodeName ?? nodeLabel}
                </span>
              )}
              <Button size="sm" onClick={() => removeEntry(i)}>X</Button>
            </div>

            <div className="ml-3 border-l-2 border-neutral-300 py-1 pl-3">
              <div className="text-[11px] font-semibold">{entry.destRoadName ?? entry.destRoadId}</div>
              {entry.sections.length === 0 ? (
                <p className="text-[11px] text-red-700">Road has no sections.</p>
              ) : entry.selectedSectionIdx === '' ? (
                <p className="text-[11px] text-red-700">Click the section on the canvas.</p>
              ) : (
                <p className="text-[11px] text-neutral-600">{section?.name ?? `Section ${(section?.index ?? 0) + 1}`}</p>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {pendingList.length > 0 && (
        <div className={`flex items-center gap-1.5 rounded border border-dashed px-2 py-1.5 ${reachedRequiredEnd ? 'border-neutral-300 text-neutral-400' : 'border-red-300 text-red-400'}`}>
          <span className="text-sm">●</span>
          {impliedNextNode ? (
            <span className="flex-1 text-xs font-medium">{impliedNextNode.name ?? impliedNextNode.id}</span>
          ) : (
            <span className="flex-1 text-[11px] italic">Click another road to continue…</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {pendingList.length > 0 && (
          <Button
            variant="primary"
            fullWidth
            disabled={!canCommit}
            onClick={handleCommit}
          >
            Add {pendingList.length === 1 ? 'road' : `${pendingList.length} roads`}
          </Button>
        )}
        <Button fullWidth onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

export default RseAddingPanel;
