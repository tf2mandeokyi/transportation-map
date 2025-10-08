import { FigmlNode, FigmlProps } from './types';
import { BaseRenderer } from './base';
import { RenderResult } from './result';

export class TextRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const text = figma.createText();
    return RenderResult.newNode(text, async () => {
      BaseRenderer.applyCommonAttributes(text, node.attributes, props);
      await this.applyTextAttributes(text, node.attributes, props);

      let content = node.content || node.attributes.text || '';
      content = BaseRenderer.interpolateValue(content, props);
      text.characters = content;
    });
  }

  private async applyTextAttributes(text: TextNode, attributes: Record<string, string>, props: FigmlProps): Promise<void> {
    if (attributes.fontFamily || attributes.style) {
      const fontFamily = BaseRenderer.interpolateValue(attributes.fontFamily || 'Inter', props);
      const style = BaseRenderer.interpolateValue(attributes.style || 'Regular', props);

      try {
        await figma.loadFontAsync({ family: fontFamily, style: style });
        text.fontName = { family: fontFamily, style: style };
      } catch {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        text.fontName = { family: 'Inter', style: 'Regular' };
      }
    }

    if (attributes.fontSize) {
      const fontSize = BaseRenderer.interpolateValue(attributes.fontSize, props);
      text.fontSize = Number(fontSize);
    }

    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      text.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.align) {
      const align = BaseRenderer.interpolateValue(attributes.align, props);
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