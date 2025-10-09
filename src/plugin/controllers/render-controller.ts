import { BaseController } from "./base-controller";

export class RenderController extends BaseController {
  public async handleRenderMap(rightHandTraffic: boolean): Promise<void> {
    this.model.setTrafficDirection(rightHandTraffic);
    await this.refresh();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    // Handle station movements, deletions, etc.
    for (const change of event.documentChanges) {
      if (change.type === 'PROPERTY_CHANGE' && (change.properties.includes('x') || change.properties.includes('y'))) {
        // A station was moved - update our model if it's a bus stop
        try {
          const figmaNode = await figma.getNodeByIdAsync(change.id);
          if (figmaNode && 'x' in figmaNode && 'y' in figmaNode) {
            // Find the station using the figma node ID
            const station = this.model.findStationByFigmaId(change.id);
            if (station) {
              this.model.updateStationPosition(station.id, { x: figmaNode.x, y: figmaNode.y });
            }
          }
        } catch (error) {
          console.warn('Failed to get node by id:', change.id, error);
        }
      }
    }
  }
}
