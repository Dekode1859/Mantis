import { describe, expect, it } from "vitest";

import {
  addProduct,
  createQueuedProduct,
  markProductQueued,
  normalizeProductUrl,
} from "./product";
import {
  isProductCacheFresh,
  loadProducts,
  markProductsCached,
  productCacheTtlMs,
  productCacheTimestampKey,
  productStorageKey,
  saveProducts,
} from "./product-store";

describe("product link flow", () => {
  it("normalizes a product URL without its fragment", () => {
    expect(normalizeProductUrl(" https://www.example.com/item#details ").toString()).toBe(
      "https://www.example.com/item",
    );
  });

  it("rejects non-web URLs", () => {
    expect(() => normalizeProductUrl("javascript:alert(1)")).toThrow(
      "Product links must use HTTP or HTTPS.",
    );
  });

  it("creates a queued product without inventing extracted data", () => {
    const product = createQueuedProduct(
      "https://www.amazon.in/dp/B000000001",
      new Date("2026-08-18T00:00:00.000Z"),
    );

    expect(product).toEqual({
      id: "https://www.amazon.in/dp/B000000001",
      sourceUrl: "https://www.amazon.in/dp/B000000001",
      site: "amazon.in",
      status: "queued",
      title: null,
      price: null,
      currency: null,
      asin: null,
      seller: null,
      extractionError: null,
      lastExtractedAt: null,
      lastAttemptedAt: "2026-08-18T00:00:00.000Z",
      addedAt: "2026-08-18T00:00:00.000Z",
    });
  });

  it("does not create duplicate cards for the same normalized URL", () => {
    const first = addProduct([], "https://example.com/item#one");
    const second = addProduct(first.products, "https://example.com/item#two");

    expect(second.added).toBe(false);
    expect(second.products).toHaveLength(1);
  });

  it("round-trips valid records through browser storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const products = [createQueuedProduct("https://example.com/item")];

    saveProducts(storage, products);

    expect(values.has(productStorageKey)).toBe(true);
    expect(loadProducts(storage)).toEqual(products);
  });

  it("tracks when the browser cache was last loaded from the server", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    markProductsCached(storage, 10_000);

    expect(values.get(productCacheTimestampKey)).toBe("10000");
    expect(isProductCacheFresh(storage, 10_000 + productCacheTtlMs - 1)).toBe(true);
    expect(isProductCacheFresh(storage, 10_000 + productCacheTtlMs)).toBe(false);
  });

  it("forces a sync when the cached product shape is outdated", () => {
    const values = new Map<string, string>([
      [productCacheTimestampKey, "10000"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(isProductCacheFresh(storage, 10_000 + 1)).toBe(false);
  });

  it("moves a failed product back to queued for retry", () => {
    const product = {
      ...createQueuedProduct("https://example.com/item"),
      status: "failed" as const,
      extractionError: "The scraper failed.",
    };

    expect(markProductQueued([product], product.id)[0]).toMatchObject({
      status: "queued",
      extractionError: null,
    });
  });
});
