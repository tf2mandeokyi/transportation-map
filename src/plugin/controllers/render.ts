import { BaseController } from "./base";

export class RenderController extends BaseController {
  public async handleRenderMap(rightHandTraffic: boolean): Promise<void> {
    this.model.setTrafficDirection(rightHandTraffic);
    await this.render();
    await this.save();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    // Handle station movements, deletions, etc.
    for (const change of event.documentChanges) {
      if (change.type === 'PROPERTY_CHANGE' && (change.properties.includes('x') || change.properties.includes('y'))) {
        // A station was moved - update our model if it's a stop
        try {
          const figmaNode = await figma.getNodeByIdAsync(change.id);
          if (figmaNode && 'x' in figmaNode && 'y' in figmaNode && 'width' in figmaNode && 'height' in figmaNode) {
            // Find the station using the figma node ID
            const station = this.model.findStationByFigmaId(change.id);
            if (station) {
              // Calculate the center position from the frame's top-left corner
              const centerX = figmaNode.x + figmaNode.width / 2;
              const centerY = figmaNode.y + figmaNode.height / 2;
              this.model.updateStationPosition(station.id, { x: centerX, y: centerY });
            }
          }
        } catch (error) {
          console.warn('Failed to get node by id:', change.id, error);
        }
      }
    }
  }
}
