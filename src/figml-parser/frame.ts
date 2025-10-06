import { FigmlNode, FigmlProps, RenderResult } from './types';
import { BaseRenderer } from './base';
import { renderNode } from '.';

export class FrameRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps, stack: number): RenderResult {
    const frame = figma.createFrame();
    const children: Array<() => Promise<void>> = [];

    // Handle special case for children prop
    if (node.content === '$$prop:children$$' && props.children) {
      if (Array.isArray(props.children)) {
        for (const child of props.children) {
          frame.appendChild(child);
        }
      } else {
        frame.appendChild(props.children);
      }
    } else {
      // Render normal children but defer appendChild
      for (const child of node.children) {
        const { node: childNode, render: childRender } = renderNode(child, props, stack + 1);
        frame.appendChild(childNode);
        children.push(childRender);
      }
    }

    return { node: frame, render: async () => {
      this.applyFrameAttributes(frame, node.attributes, props);
      BaseRenderer.applyCommonAttributes(frame, node.attributes, props);
      await Promise.all(children.map(c => c()));
    }};
  }

  private applyFrameAttributes(frame: FrameNode, attributes: Record<string, string>, props: FigmlProps) {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      frame.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    } else {
      frame.fills = [];
    }

    if (attributes.clip === 'false') {
      frame.clipsContent = false;
    }

    // Handle layout flow
    if (attributes.flow) {
      const flow = BaseRenderer.interpolateValue(attributes.flow, props);
      if (flow === 'horizontal') {
        frame.layoutMode = 'HORIZONTAL';
      } else if (flow === 'vertical') {
        frame.layoutMode = 'VERTICAL';
      }
    }

    // Handle layout gap
    if (attributes.gap) {
      const gap = Number(BaseRenderer.interpolateValue(attributes.gap, props));
      if (!isNaN(gap) && frame.layoutMode !== 'NONE') {
        frame.itemSpacing = gap;
      }
    }

    // Handle padding
    if (attributes.padding) {
      const padding = BaseRenderer.interpolateValue(attributes.padding, props);
      if (frame.layoutMode !== 'NONE') {
        const paddingValues = this.parsePadding(padding);
        frame.paddingLeft = paddingValues.l;
        frame.paddingRight = paddingValues.r;
        frame.paddingTop = paddingValues.t;
        frame.paddingBottom = paddingValues.b;
      }
    }

    // Handle align (for auto layout)
    if (attributes.align && frame.layoutMode !== 'NONE') {
      const align = BaseRenderer.interpolateValue(attributes.align, props);
      const [h, v] = align.split(',');

      if (frame.layoutMode === 'HORIZONTAL') {
        switch (h) {
          case 'left': frame.primaryAxisAlignItems = 'MIN'; break;
          case 'center': frame.primaryAxisAlignItems = 'CENTER'; break;
          case 'right': frame.primaryAxisAlignItems = 'MAX'; break;
        }
        switch (v) {
          case 'top': frame.counterAxisAlignItems = 'MIN'; break;
          case 'center': frame.counterAxisAlignItems = 'CENTER'; break;
          case 'bottom': frame.counterAxisAlignItems = 'MAX'; break;
        }
      } else if (frame.layoutMode === 'VERTICAL') {
        switch (v) {
          case 'top': frame.primaryAxisAlignItems = 'MIN'; break;
          case 'center': frame.primaryAxisAlignItems = 'CENTER'; break;
          case 'bottom': frame.primaryAxisAlignItems = 'MAX'; break;
        }
        switch (h) {
          case 'left': frame.counterAxisAlignItems = 'MIN'; break;
          case 'center': frame.counterAxisAlignItems = 'CENTER'; break;
          case 'right': frame.counterAxisAlignItems = 'MAX'; break;
        }
      }
    }
  }

  private parsePadding(padding: string): { l: number, r: number, t: number, b: number } {
    const values = { l: 0, r: 0, t: 0, b: 0 };
    const parts = padding.split(',');
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      const parsed = Number(value) || 0;
      if (isNaN(parsed)) continue;
      if (key === 'h') values.l = values.r = parsed;
      if (key === 'v') values.t = values.b = parsed;
      if (key === 'l') values.l = parsed;
      if (key === 'r') values.r = parsed;
      if (key === 't') values.t = parsed;
      if (key === 'b') values.b = parsed;
    }
    return values;
  }
}