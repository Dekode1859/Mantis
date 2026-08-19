import { describe, expect, it } from "vitest";

import { createQueuedProduct, ProductScanSchema } from "./product";
import {
  clearProductScanCache,
  loadProductScanCache,
  productScanStoragePrefix,
  saveProductScanCache,
} from "./scan-store";

const scan = ProductScanSchema.parse({
  id: "33333333-3333-4333-8333-333333333333",
  productId: "11111111-1111-4111-8111-111111111111",
  scraperConfigurationId: null,
  method: "deterministic",
  trigger: "retry",
  actor: "user",
  status: "ready",
  title: "Power bank",
  price: 3499,
  currency: "INR",
  model: "gpt-oss:120b",
  durationMs: 2247,
  extractionError: null,
  scannedAt: "2026-08-19T00:00:00.000Z",
});

describe("product scan browser cache", () => {
  it("round-trips validated history by product ID", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    saveProductScanCache(storage, scan.productId, [scan], 10_000);

    expect(values.has(`${productScanStoragePrefix}${scan.productId}`)).toBe(true);
    expect(loadProductScanCache(storage, scan.productId)).toEqual({
      scans: [scan],
      cachedAt: 10_000,
    });
  });

  it("does not return malformed cached history", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const productId = createQueuedProduct("https://example.com/item").id;

    values.set(
      `${productScanStoragePrefix}${productId}`,
      JSON.stringify({ scans: [{ status: "invalid" }], cachedAt: 10_000 }),
    );

    expect(loadProductScanCache(storage, productId)).toBeUndefined();
  });

  it("clears one product's history without touching another", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const first = scan.productId;
    const second = "44444444-4444-4444-8444-444444444444";

    saveProductScanCache(storage, first, [scan]);
    saveProductScanCache(storage, second, [scan]);
    clearProductScanCache(storage, first);

    expect(loadProductScanCache(storage, first)).toBeUndefined();
    expect(loadProductScanCache(storage, second)?.scans).toEqual([scan]);
  });
});
