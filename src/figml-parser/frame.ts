import { FigmlNode } from './types';
import { BaseRenderer } from './base';
import { renderNode } from '.';

export class FrameRenderer extends BaseRenderer {
  static renderNodeCallback?: (node: FigmlNode, props: Record<string, any>) => Promise<SceneNode>;

  async render(node: FigmlNode, props: Record<string, any>): Promise<FrameNode> {
    const frame = figma.createFrame();
    BaseRenderer.applyCommonAttributes(frame, node.attributes, props);
    this.applyFrameAttributes(frame, node.attributes, props);

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
      // Render normal children in parallel
      const childNodes = await Promise.all(
        node.children.map(child => renderNode(child, props))
      );

      // Add children sequentially to preserve order
      for (let i = 0; i < childNodes.length; i++) {
        frame.appendChild(childNodes[i]);
      }

      // Apply layout sizing in parallel
      await Promise.all(
        childNodes.map((childNode, i) =>
          this.applyLayoutSizing(childNode, node.children[i].attributes, props)
        )
      );
    }

    return frame;
  }

  private applyFrameAttributes(frame: FrameNode, attributes: Record<string, string>, props: Record<string, any>) {
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
        frame.paddingLeft = paddingValues.h;
        frame.paddingRight = paddingValues.h;
        frame.paddingTop = paddingValues.v;
        frame.paddingBottom = paddingValues.v;
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

  private async applyLayoutSizing(node: SceneNode, attributes: Record<string, string>, props: Record<string, any>): Promise<void> {
    if (!node.parent || node.parent.type !== 'FRAME') return;
    const parentFrame = node.parent as FrameNode;
    if (parentFrame.layoutMode === 'NONE') return;

    if (node.type === 'FRAME') {
      const frame = node as FrameNode;

      if (attributes.width) {
        const width = BaseRenderer.interpolateValue(attributes.width, props);
        try {
          if (width === 'hug') {
            frame.layoutSizingHorizontal = 'HUG';
          } else if (width === 'fill') {
            frame.layoutSizingHorizontal = 'FILL';
          } else if (!isNaN(Number(width))) {
            frame.layoutSizingHorizontal = 'FIXED';
          }
        } catch (error) {
          console.error(`Error setting layoutSizingHorizontal to ${width}:`, error);
        }
      }

      if (attributes.height) {
        const height = BaseRenderer.interpolateValue(attributes.height, props);
        try {
          if (height === 'hug') {
            frame.layoutSizingVertical = 'HUG';
          } else if (height === 'fill') {
            frame.layoutSizingVertical = 'FILL';
          } else if (!isNaN(Number(height))) {
            frame.layoutSizingVertical = 'FIXED';
          }
        } catch (error) {
          console.error(`Error setting layoutSizingVertical to ${height}:`, error);
        }
      }
    } else {
      // For non-frame nodes (rectangles, ellipses, etc.)
      if (attributes.height) {
        const height = BaseRenderer.interpolateValue(attributes.height, props);
        if (height === 'fill') {
          try {
            if (parentFrame.layoutMode === 'HORIZONTAL') {
              (node as any).layoutAlign = 'STRETCH';
            } else if (parentFrame.layoutMode === 'VERTICAL') {
              (node as any).layoutGrow = 1;
            }
          } catch (error) {
            console.error(`Error setting layout properties for ${node.type} with height fill:`, error);
          }
        }
      }

      if (attributes.width) {
        const width = BaseRenderer.interpolateValue(attributes.width, props);
        if (width === 'fill') {
          try {
            if (parentFrame.layoutMode === 'VERTICAL') {
              (node as any).layoutAlign = 'STRETCH';
            } else if (parentFrame.layoutMode === 'HORIZONTAL') {
              (node as any).layoutGrow = 1;
            }
          } catch (error) {
            console.error(`Error setting layout properties for ${node.type} with width fill:`, error);
          }
        }
      }
    }
  }

  private parsePadding(padding: string): { h: number, v: number } {
    const values = { h: 0, v: 0 };
    const parts = padding.split(',');
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 'h') values.h = Number(value) || 0;
      if (key === 'v') values.v = Number(value) || 0;
    }
    return values;
  }
}