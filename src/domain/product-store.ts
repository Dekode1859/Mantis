import { ProductRecordSchema, type ProductRecord } from "./product";

const storageKey = "mantis.products.v1";

export type ProductStorage = Pick<Storage, "getItem" | "setItem">;

export function loadProducts(storage: ProductStorage | undefined): ProductRecord[] {
  if (!storage) return [];

  const raw = storage.getItem(storageKey);
  if (!raw) return [];

  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const parsed = ProductRecordSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

export function saveProducts(storage: ProductStorage | undefined, products: ProductRecord[]): void {
  if (!storage) return;
  storage.setItem(storageKey, JSON.stringify(products));
}

export const productStorageKey = storageKey;
