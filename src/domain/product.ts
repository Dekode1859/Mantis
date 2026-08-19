import { z } from "zod";

export const ProductStatusSchema = z.enum(["queued", "ready", "failed"]);
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
const PriceSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.number().finite().nonnegative().nullable(),
);

export const ProductRecordSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().url(),
  site: z.string().min(1),
  status: ProductStatusSchema,
  title: z.string().min(1).nullable(),
  price: PriceSchema.default(null),
  currency: CurrencyCodeSchema.nullable().default(null),
  asin: z.string().min(1).nullable().default(null),
  seller: z.string().min(1).nullable().default(null),
  extractionError: z.string().min(1).nullable().default(null),
  addedAt: z.string().datetime(),
});

export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export const ExtractionResultSchema = z.object({
  status: z.literal("ready"),
  source_url: z.string().url(),
  title: z.string().min(1),
  price: z.number().finite().nonnegative(),
  currency: CurrencyCodeSchema,
  asin: z.string().min(1).nullable(),
  seller: z.string().min(1).nullable(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

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
    price: null,
    currency: null,
    asin: null,
    seller: null,
    extractionError: null,
    addedAt: addedAt.toISOString(),
  });
}

export function markProductReady(
  products: ProductRecord[],
  productId: string,
  result: ExtractionResult,
): ProductRecord[] {
  return products.map((product) =>
    product.id === productId
      ? ProductRecordSchema.parse({
          ...product,
          status: "ready",
          title: result.title,
          price: result.price,
          currency: result.currency,
          asin: result.asin,
          seller: result.seller,
          extractionError: null,
        })
      : product,
  );
}

export function markProductQueued(
  products: ProductRecord[],
  productId: string,
): ProductRecord[] {
  return products.map((product) =>
    product.id === productId
      ? ProductRecordSchema.parse({
          ...product,
          status: "queued",
          extractionError: null,
        })
      : product,
  );
}

export function markProductFailed(
  products: ProductRecord[],
  productId: string,
  message: string,
): ProductRecord[] {
  return products.map((product) =>
    product.id === productId
      ? ProductRecordSchema.parse({ ...product, status: "failed", extractionError: message })
      : product,
  );
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
