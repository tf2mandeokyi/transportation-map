import { FigmlNode, FigmlProps } from './types';
import { BaseRenderer } from './base';
import { RenderResult } from './result';
import { StringTemplate } from './template';

export class TextRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const text = figma.createText();
    return RenderResult.newNode(text, async () => {
      BaseRenderer.applyCommonAttributes(text, node.attributes, props);
      await this.applyTextAttributes(text, node.attributes, props);

      let content = node.content || node.attributes.text || StringTemplate.fromRaw('');
      text.characters = content.interpolate(props);
    });
  }

  private async applyTextAttributes(text: TextNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps): Promise<void> {
    let fontFamily: string | undefined = undefined;
    let style: string | undefined = undefined;
    if (attributes.fontFamily) fontFamily = attributes.fontFamily.interpolate(props);
    if (attributes.style) style = attributes.style.interpolate(props);
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

    if (attributes.fontSize) {
      const fontSize = attributes.fontSize.interpolate(props);
      text.fontSize = Number(fontSize);
    }

    if (attributes.fill) {
      const fill = attributes.fill.interpolate(props);
      text.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.align) {
      const align = attributes.align.interpolate(props);
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