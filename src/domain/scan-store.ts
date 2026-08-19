import { ProductScanSchema, type ProductScan } from "./product";

const storagePrefix = "mantis.product-scans.v1.";

export type ScanStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ProductScanCache = {
  scans: ProductScan[];
  cachedAt: number;
};

function storageKey(productId: string): string {
  return `${storagePrefix}${encodeURIComponent(productId)}`;
}

export function loadProductScanCache(
  storage: ScanStorage | undefined,
  productId: string,
): ProductScanCache | undefined {
  if (!storage) return undefined;

  const raw = storage.getItem(storageKey(productId));
  if (!raw) return undefined;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    if (!("scans" in value) || !("cachedAt" in value)) return undefined;

    const scans = ProductScanSchema.array().safeParse(value.scans);
    const cachedAt = typeof value.cachedAt === "number" ? value.cachedAt : NaN;
    if (!scans.success || !Number.isFinite(cachedAt) || cachedAt <= 0) return undefined;

    return { scans: scans.data, cachedAt };
  } catch {
    return undefined;
  }
}

export function saveProductScanCache(
  storage: ScanStorage | undefined,
  productId: string,
  scans: ProductScan[],
  cachedAt = Date.now(),
): void {
  if (!storage) return;
  storage.setItem(storageKey(productId), JSON.stringify({ scans, cachedAt }));
}

export function clearProductScanCache(
  storage: ScanStorage | undefined,
  productId: string,
): void {
  if (!storage) return;
  storage.removeItem(storageKey(productId));
}

export const productScanStoragePrefix = storagePrefix;
