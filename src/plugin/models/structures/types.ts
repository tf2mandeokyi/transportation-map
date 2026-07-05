import { MapState } from "./map-state";

export abstract class TransportationMapObject<Id> {
  protected readonly mapState: Readonly<MapState>;
  id: Id;

  constructor(mapState: Readonly<MapState>, id: Id) {
    this.mapState = mapState;
    this.id = id;
  }
}