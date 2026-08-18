import { describe, expect, it } from "vitest";

import {
  addProduct,
  createQueuedProduct,
  normalizeProductUrl,
} from "./product";
import { loadProducts, productStorageKey, saveProducts } from "./product-store";

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
});
