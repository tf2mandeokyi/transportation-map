import { XMLParser } from 'fast-xml-parser';
import { FigmlComponent, FigmlNode } from './types';

export class FigmlParser {
  private static importResolver?: (path: string) => string;

  static setImportResolver(resolver: (path: string) => string): void {
    this.importResolver = resolver;
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
          const variantKey = this.extractVariantKey(variantData);
          if (variantData.frame) {
            const frameContent = this.convertToFigmlNode(variantData.frame, 'frame');
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
        const rootNode = this.convertToFigmlNode(componentData[directContent], directContent);
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
      return this.resolveImport(xmlNode);
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
            result.children.push(this.convertToFigmlNode(item, key));
          }
        } else if (value && typeof value === 'object') {
          result.children.push(this.convertToFigmlNode(value, key));
        }
      }
    }

    return result;
  }

  private static resolveImport(xmlNode: any): FigmlNode {
    if (!this.importResolver) {
      throw new Error('Import resolver not set. Use FigmlParser.setImportResolver() to configure imports.');
    }

    // Extract attributes - they should be direct properties on xmlNode for self-closing tags
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(xmlNode)) {
      if (typeof value === 'string' && key !== '#text') {
        attributes[key] = value;
      }
    }

    const fromPath = attributes.from;
    if (!fromPath) {
      console.error('Available attributes:', Object.keys(attributes));
      throw new Error('Import tag must have a "from" attribute');
    }

    // Load the imported component
    const importedContent = this.importResolver(fromPath);
    const importedComponent = this.parseComponent(importedContent);

    // Components without explicit variants use the root content as default
    let rootNode: FigmlNode;
    if (importedComponent.variants['']) {
      // Component has implicit default variant (no variant key)
      rootNode = importedComponent.variants[''];
    } else if (importedComponent.variants['default']) {
      rootNode = importedComponent.variants['default'];
    } else {
      // Take the first variant
      const firstVariant = Object.keys(importedComponent.variants)[0];
      if (!firstVariant) {
        throw new Error('Imported component has no variants');
      }
      rootNode = importedComponent.variants[firstVariant];
    }

    // Merge props from import tag with the imported component
    const mergedAttributes = { ...rootNode.attributes };

    // Override with props from the import tag
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('prop:')) {
        const propName = key.substring(5);
        mergedAttributes[propName] = value as string;
      }
    }

    return {
      ...rootNode,
      attributes: mergedAttributes
    };
  }
}