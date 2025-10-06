import { FigmlComponent, FigmlNode } from './types';

export class ImportResolver {
  private static importResolver?: (path: string) => string;

  static setImportResolver(resolver: (path: string) => string): void {
    this.importResolver = resolver;
  }

  static resolveImport(xmlNode: any, parseComponent: (content: string) => FigmlComponent): FigmlNode {
    if (!this.importResolver) {
      throw new Error('Import resolver not set. Use ImportResolver.setImportResolver() to configure imports.');
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
    const importedComponent = parseComponent(importedContent);

    // Calculate variant key based on import props
    const variantProps: string[] = [];
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('prop:') && key !== 'prop:from') {
        const propName = key.substring(5);
        variantProps.push(`${propName}:${value}`);
      }
    }
    const variantKey = variantProps.length > 0 ? variantProps.join(',') : '';

    // Select the appropriate variant
    let rootNode: FigmlNode;
    if (variantKey && importedComponent.variants[variantKey]) {
      // Use the specific variant that matches our props
      rootNode = importedComponent.variants[variantKey];
    } else if (importedComponent.variants['']) {
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