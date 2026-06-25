export type HVAlign = 'left' | 'right' | 'top' | 'bottom';
export type TextHAlign = 'left' | 'center' | 'right';

export type StationId = string & { readonly __brand: 'StationId' };
export type LineId = string & { readonly __brand: 'LineId' };
export type NodeId = string & { readonly __brand: 'NodeId' };
export type RoadId = string & { readonly __brand: 'RoadId' };
export type SectionId = string & { readonly __brand: 'SectionId' };
export type RoadSectionId = [RoadId, SectionId];
