import { FigmlNode, FigmlProps } from '../types';
import { BaseRenderer } from './base';
import { RenderResult } from '../result';
import { FigmlParser } from '../parser';
import { StringTemplate } from '../template';
import { resolveImport } from '../../figml/resources';

export class ImportRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    // Extract import attributes
    const fromPath = node.attributes.from?.interpolate(props);
    if (!fromPath) {
      throw new Error('Import must have a "from" attribute');
    }

    // Load and parse the imported component
    const importedContent = resolveImport(fromPath);
    const importedComponent = FigmlParser.parseComponent(importedContent);

    // Build props for the imported component by merging parent props with import props
    const childProps: FigmlProps = {};

    // Add all attributes to childProps (interpolate StringTemplates with current props context)
    for (const [key, value] of Object.entries(node.attributes)) {
      if (key !== 'from' && value) {
        childProps[key] = value.interpolate(props);
      }
    }

    // Handle content if present - check if it's a template reference to children prop
    if (node.content) {
      // If the content is just "$$prop:children$$", pass through the parent's children prop
      if (node.content.onlyHasChildrenTemplate()) {
        // Pass through the parent's children prop if it exists
        if (props.children !== undefined) {
          childProps.children = props.children;
        }
      } else {
        // Otherwise interpolate the content as a string
        childProps.children = node.content.interpolate(props);
      }
    }

    // Determine which variant to use based on props
    const variantPropNames = new Set<string>();
    const availableVariants = Object.keys(importedComponent.variants);

    for (const vKey of availableVariants) {
      if (vKey) {  // Skip empty variant key when collecting prop names
        const pairs = vKey.split(',');
        for (const pair of pairs) {
          const [propName] = pair.split(':');
          if (propName) variantPropNames.add(propName);
        }
      }
    }

    // Build variant props object from childProps
    const variantPropsObj: Record<string, string> = {};
    for (const propName of variantPropNames) {
      if (childProps[propName] !== undefined) {
        const value = childProps[propName];
        // Interpolate if it's a StringTemplate
        const stringValue = value instanceof StringTemplate ? value.interpolate(props) : String(value);
        variantPropsObj[propName] = stringValue;
      }
    }

    // Render the appropriate variant with merged props
    return importedComponent.render(childProps, variantPropsObj);
  }
}
