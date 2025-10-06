import { XMLParser } from 'fast-xml-parser';
import { FigmlComponent, FigmlNode } from './types';
import { ImportResolver } from './import-resolver';

export class FigmlParser {
  static setImportResolver(resolver: (path: string) => string): void {
    ImportResolver.setImportResolver(resolver);
  }

  static parseComponent(figmlContent: string): FigmlComponent {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
      trimValues: true,
      textNodeName: "#text"
    });

    const result = parser.parse(figmlContent);
    const componentData = result.component;

    if (!componentData) {
      throw new Error('Root element must be a component');
    }

    const component: FigmlComponent = {
      props: {},
      variants: {}
    };

    // Extract component props
    for (const [key, value] of Object.entries(componentData)) {
      if (key.startsWith('prop:')) {
        component.props[key.substring(5)] = value as string;
      }
    }

    // Extract variants
    if (componentData.variant) {
      const variants = Array.isArray(componentData.variant) ? componentData.variant : [componentData.variant];

      for (const variantData of variants) {
        if (variantData) {
          const variantKey = FigmlParser.extractVariantKey(variantData);
          if (variantData.frame) {
            const frameContent = FigmlParser.convertToFigmlNode(variantData.frame, 'frame');
            component.variants[variantKey] = frameContent;
          }
        }
      }
    } else {
      // No explicit variants - treat direct content as default variant
      const directContent = Object.keys(componentData).find(key =>
        !key.startsWith('prop:') && key !== '@' && key !== '#text'
      );

      if (directContent && componentData[directContent]) {
        const rootNode = FigmlParser.convertToFigmlNode(componentData[directContent], directContent);
        component.variants[''] = rootNode;
      }
    }

    return component;
  }

  private static extractVariantKey(attributes: Record<string, string>): string {
    const props: string[] = [];
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('prop:')) {
        props.push(`${key.substring(5)}:${value}`);
      }
    }
    return props.length > 0 ? props.join(',') : 'default';
  }

  private static convertToFigmlNode(xmlNode: any, tagName?: string): FigmlNode {
    if (typeof xmlNode === 'string' || typeof xmlNode === 'number') {
      return {
        tag: tagName || 'text',
        attributes: {},
        children: [],
        content: String(xmlNode)
      };
    }

    if (!xmlNode || typeof xmlNode !== 'object') {
      return {
        tag: tagName || 'unknown',
        attributes: {},
        children: []
      };
    }

    let tag = tagName;
    if (!tag) {
      for (const key of Object.keys(xmlNode)) {
        if (key !== '@' && key !== '#text') {
          tag = key;
          xmlNode = xmlNode[key];
          break;
        }
      }
    }

    if (!tag) {
      tag = 'unknown';
    }

    // Handle import tags after we've determined the tag name
    if (tag === 'import') {
      return ImportResolver.resolveImport(xmlNode, FigmlParser.parseComponent);
    }

    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(xmlNode)) {
      if (typeof value === 'string' && key !== '#text') {
        attributes[key] = value;
      }
    }

    const result: FigmlNode = {
      tag: tag,
      attributes: attributes,
      children: []
    };

    if (xmlNode['#text']) {
      result.content = xmlNode['#text'];
    }

    for (const [key, value] of Object.entries(xmlNode)) {
      if (key !== '@' && key !== '#text') {
        if (Array.isArray(value)) {
          for (const item of value) {
            result.children.push(FigmlParser.convertToFigmlNode(item, key));
          }
        } else if (value && typeof value === 'object') {
          result.children.push(FigmlParser.convertToFigmlNode(value, key));
        }
      }
    }

    return result;
  }

}