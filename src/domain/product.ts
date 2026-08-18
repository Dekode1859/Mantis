import { z } from "zod";

export const ProductStatusSchema = z.enum(["queued", "ready", "failed"]);

export const ProductRecordSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().url(),
  site: z.string().min(1),
  status: ProductStatusSchema,
  title: z.string().min(1).nullable(),
  addedAt: z.string().datetime(),
});

export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export function normalizeProductUrl(input: string): URL {
  const value = input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete product URL.");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("Product links must use HTTP or HTTPS.");
  }

  if (!url.hostname) {
    throw new Error("The product URL must include a hostname.");
  }

  url.hash = "";
  return url;
}

export function createQueuedProduct(input: string, addedAt = new Date()): ProductRecord {
  const url = normalizeProductUrl(input);
  const sourceUrl = url.toString();

  return ProductRecordSchema.parse({
    id: sourceUrl,
    sourceUrl,
    site: url.hostname.replace(/^www\./, ""),
    status: "queued",
    title: null,
    addedAt: addedAt.toISOString(),
  });
}

export function addProduct(
  products: ProductRecord[],
  input: string,
  addedAt = new Date(),
): { product: ProductRecord; products: ProductRecord[]; added: boolean } {
  const product = createQueuedProduct(input, addedAt);
  const existing = products.find((item) => item.id === product.id);

  if (existing) {
    return { product: existing, products, added: false };
  }

  return { product, products: [product, ...products] , added: true };
}
