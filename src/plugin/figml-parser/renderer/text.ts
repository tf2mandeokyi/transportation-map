import { FigmlNode, FigmlProps } from '../types';
import { BaseRenderer } from './base';
import { RenderResult } from '../result';
import { StringTemplate } from '../template';
import { hexToRgb } from '@/common/utils/color';

export class TextRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const text = figma.createText();
    return RenderResult.newNode(text, async () => {
      BaseRenderer.applyCommonAttributes(text, node.attributes, props);
      await this.applyTextAttributes(text, node.attributes, props);

      let content = node.content || node.attributes.text;
      if (!content) throw new Error("Text node must have content or text attribute");
      text.characters = content.interpolate(props);
    }, () => {
      BaseRenderer.applyVisibilityAttribute(text, node.attributes, props);
    });
  }

  private async applyTextAttributes(text: TextNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps): Promise<void> {
    let fontFamily = attributes.fontFamily?.interpolate(props);
    let style = attributes.style?.interpolate(props);
    const fontSize = attributes.fontSize?.interpolate(props);
    const fill = attributes.fill?.interpolate(props);
    const stroke = attributes.stroke?.interpolate(props);
    const strokeWidth = attributes.strokeWidth?.interpolate(props);
    const align = attributes.align?.interpolate(props);
    
    if (fontFamily || style) {
      fontFamily = fontFamily || 'Inter';
      style = style || 'Regular';

      try {
        await figma.loadFontAsync({ family: fontFamily, style: style });
        text.fontName = { family: fontFamily, style: style };
      } catch {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        text.fontName = { family: 'Inter', style: 'Regular' };
      }
    }

    if (fontSize) {
      text.fontSize = Number(fontSize);
    }

    if (fill) {
      text.fills = [{ type: 'SOLID', color: hexToRgb(fill) }];
    }

    if (stroke) {
      text.strokes = [{ type: 'SOLID', color: hexToRgb(stroke) }];
    }

    if (strokeWidth) {
      text.strokeWeight = Number(strokeWidth);
    }

    if (align) {
      const [h, v] = align.split(',');

      switch (h) {
        case 'left': text.textAlignHorizontal = 'LEFT'; break;
        case 'center': text.textAlignHorizontal = 'CENTER'; break;
        case 'right': text.textAlignHorizontal = 'RIGHT'; break;
      }

      switch (v) {
        case 'top': text.textAlignVertical = 'TOP'; break;
        case 'center': text.textAlignVertical = 'CENTER'; break;
        case 'bottom': text.textAlignVertical = 'BOTTOM'; break;
      }
    }
  }
}