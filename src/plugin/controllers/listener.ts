export interface ListenerHandle {
  dispose(): void;
}

type AnyDocumentChange = DocumentChangeEvent['documentChanges'][number];

export class NodeChangeListener {
  private readonly handlers = new Map<string, Map<symbol, (change: AnyDocumentChange) => void | Promise<void>>>();

  dispatch(change: AnyDocumentChange): void {
    const nodeHandlers = this.handlers.get(change.id);
    if (!nodeHandlers) return;
    for (const handler of nodeHandlers.values()) {
      const result = handler(change);
      if (result instanceof Promise) result.catch(console.error);
    }
  }

  register(nodeId: string, handler: (change: AnyDocumentChange) => void | Promise<void>): ListenerHandle {
    if (!this.handlers.has(nodeId)) this.handlers.set(nodeId, new Map());
    const id = Symbol();
    this.handlers.get(nodeId)?.set(id, handler);
    return { dispose: () => this.handlers.get(nodeId)?.delete(id) };
  }
}
