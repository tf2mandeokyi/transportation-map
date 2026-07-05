export type Owned<T> = T & { readonly __ownershipBrand: 'owned' };

export function own<T>(obj: T): Owned<T> {
  return obj as Owned<T>;
}