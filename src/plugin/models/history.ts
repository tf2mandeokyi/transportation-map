// Snapshot-based undo/redo. Entries are full serializeMapState() strings — cheap
// at this data size (see MapState) and lets us reuse the existing serde round-trip
// instead of building a command/patch system.
export class HistoryManager {
  private static readonly CAP = 50;
  // Continuous canvas drags (station/node move, radius/offset/bezier handles) fire
  // many mutations per gesture with no discrete "commit" message — checkpointGesture
  // merges any calls within this window into the single checkpoint that started it.
  private static readonly GESTURE_IDLE_MS = 600;

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private gestureIdleTimer: ReturnType<typeof setTimeout> | null = null;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  // Call with the state serialized *before* a discrete, already-completed action
  // (a one-shot message handler, or a session's Apply/confirm).
  checkpoint(serializedBefore: string): void {
    this.undoStack.push(serializedBefore);
    if (this.undoStack.length > HistoryManager.CAP) this.undoStack.shift();
    this.redoStack = [];
  }

  checkpointGesture(serializedBefore: string): void {
    if (this.gestureIdleTimer !== null) {
      clearTimeout(this.gestureIdleTimer);
    } else {
      this.checkpoint(serializedBefore);
    }
    this.gestureIdleTimer = setTimeout(() => { this.gestureIdleTimer = null; }, HistoryManager.GESTURE_IDLE_MS);
  }

  // Returns the snapshot to restore, or null if there's nothing to undo.
  undo(serializedCurrent: string): string | null {
    const snapshot = this.undoStack.pop();
    if (snapshot === undefined) return null;
    this.redoStack.push(serializedCurrent);
    return snapshot;
  }

  redo(serializedCurrent: string): string | null {
    const snapshot = this.redoStack.pop();
    if (snapshot === undefined) return null;
    this.undoStack.push(serializedCurrent);
    return snapshot;
  }
}
