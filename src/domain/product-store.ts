import { ProductRecordSchema, type ProductRecord } from "./product";

const storageKey = "mantis.products.v1";
const cacheTimestampKey = "mantis.products.cache-timestamp.v1";

export const productCacheTtlMs = 60_000;

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

export function loadProductsCachedAt(storage: ProductStorage | undefined): number | undefined {
  if (!storage) return undefined;

  const value = Number(storage.getItem(cacheTimestampKey));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function markProductsCached(
  storage: ProductStorage | undefined,
  cachedAt = Date.now(),
): void {
  if (!storage) return;
  storage.setItem(cacheTimestampKey, String(cachedAt));
}

export function isProductCacheFresh(
  storage: ProductStorage | undefined,
  now = Date.now(),
  maxAgeMs = productCacheTtlMs,
): boolean {
  const cachedAt = loadProductsCachedAt(storage);
  return cachedAt !== undefined && cachedAt <= now && now - cachedAt < maxAgeMs;
}

export const productStorageKey = storageKey;
export const productCacheTimestampKey = cacheTimestampKey;
