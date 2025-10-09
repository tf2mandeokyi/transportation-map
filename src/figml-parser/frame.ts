import { FigmlNode, FigmlProps } from './types';
import { BaseRenderer } from './base';
import { renderNode } from '.';
import { RenderResult } from './result';
import { StringTemplate } from './template';

export class FrameRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const frame = figma.createFrame();
    const children: RenderResult[] = [];

    // Handle special case for children prop
    if (node.content?.onlyHasChildren() && props.children) {
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
        children.push(renderNode(child, props));
      }
    }

    return RenderResult.newFrameNode(frame, children, () => {
      this.applyFrameAttributes(frame, node.attributes, props);
      BaseRenderer.applyCommonAttributes(frame, node.attributes, props);
    });
  }

  private applyFrameAttributes(frame: FrameNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    if (attributes.fill) {
      const fill = attributes.fill.interpolate(props);
      frame.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    } else {
      frame.fills = [];
    }

    if (attributes.clip) {
      const clip = attributes.clip.interpolate(props);
      if (clip !== 'true' && clip !== 'false') {
        throw Error(`Invalid value for clip attribute: ${clip}. Expected 'true' or 'false'.`);
      }
      frame.clipsContent = (clip === 'true');
    }

    // Handle layout flow
    if (attributes.flow) {
      const flow = attributes.flow.interpolate(props);
      if (flow === 'horizontal') {
        frame.layoutMode = 'HORIZONTAL';
      } else if (flow === 'vertical') {
        frame.layoutMode = 'VERTICAL';
      }
    }

    // Handle layout gap
    if (attributes.gap) {
      const gap = Number(attributes.gap.interpolate(props));
      if (!isNaN(gap) && frame.layoutMode !== 'NONE') {
        frame.itemSpacing = gap;
      }
    }

    // Handle padding
    if (attributes.padding) {
      const padding = attributes.padding.interpolate(props);
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
      const align = attributes.align.interpolate(props);
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