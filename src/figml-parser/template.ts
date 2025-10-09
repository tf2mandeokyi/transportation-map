import { FigmlProps } from "./types";

function isRgbObject(value: any): value is RGB {
  return value && typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number';
}

export class StringTemplate {
  
  static fromRaw(raw: string): StringTemplate {
    return new StringTemplate([raw], []);
  }

  static parseDollarTemplates(input: string): StringTemplate {
    const propValueArray = input.split('$$').map(s => s.replace('$\\$', '$$'));
    for (let i = 1; i < propValueArray.length; i += 2) {
      const str = propValueArray[i];
      if (!str.startsWith('prop:')) {
        throw new Error(`Invalid template string "${input}". Only property bindings like "$$prop:propertyName$$" are allowed.`);
      }
      propValueArray[i] = str.substring(5);
    }
    if (propValueArray.length % 2 === 0) {
      throw new Error(`Invalid template string "${input}". Mismatched "$$" pairs.`);
    }

    return new StringTemplate(
      propValueArray.filter((_, i) => i % 2 === 0),
      propValueArray.filter((_, i) => i % 2 === 1)
    );
  }
  
  private readonly raws: string[];
  private readonly templates: string[];
  
  constructor(raws: string[], templates: string[]) {
    this.raws = raws;
    this.templates = templates;
  }

  onlyHasChildren(): boolean {
    return this.raws.length === 2
      && this.raws[0].trim() === ''
      && this.raws[1].trim() === ''
      && this.templates.length === 1
      && this.templates[0] === 'children';
  }

  interpolate(props: FigmlProps): string {
    const templateEvaluations = this.templates.map(template => {
      const propValue = props[template];
      if (propValue === undefined || propValue === null) {
        console.warn(`Property "${template}" is not provided in props: `, props);
        return template;
      }
      if (typeof propValue === 'string' || typeof propValue === 'number' || typeof propValue === 'boolean') {
        return String(propValue);
      }
      if (isRgbObject(propValue)) {
        const rgb = propValue as RGB;
        const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
      console.warn(`Property "${template}" has unsupported type: `, propValue);
      return template;
    });
    const result = this.raws.reduce((acc, raw, i) => acc + raw + (templateEvaluations[i] || ''), '');
    return result;
  }
}