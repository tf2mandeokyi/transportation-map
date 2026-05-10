import { BaseController } from "./base";

export class RenderController extends BaseController {
  public async handleRenderMap(): Promise<void> {
    await this.render();
    await this.save();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    for (const change of event.documentChanges) {
      if (change.type === 'PROPERTY_CHANGE' && (change.properties.includes('x') || change.properties.includes('y'))) {
        // Station position is now derived from interpT on a RoadSection bezier;
        // document movement does not change interpT — re-render to snap back,
        // or in future: inverse-project new position onto the road bezier.
        // For now, just log.
        const station = this.model.findStationByFigmaId(change.id);
        if (station) {
          console.log(`Station ${station.name} moved in Figma; interpT unchanged`);
        }
      }
    }
  }
}
