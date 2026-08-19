import { ProductRecordSchema, type ExtractionResult, type ProductRecord } from "../domain/product";
import { z } from "zod";

export interface ProductPersistenceEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface ProductWrite {
  sourceUrl: string;
  site: string;
  status: "queued" | "ready" | "failed";
  title: string | null;
  price: number | null;
  currency: string | null;
  asin: string | null;
  seller: string | null;
  extractionError: string | null;
  scraperConfigurationId?: string | null;
}

const ProductRowSchema = z.object({
  id: z.string().min(1),
  source_url: z.string().url(),
  site: z.string().min(1),
  status: z.enum(["queued", "ready", "failed"]),
  title: z.string().nullable(),
  price: z.union([z.number(), z.string()]).nullable(),
  currency: z.string().nullable(),
  external_product_id: z.string().nullable(),
  seller_name: z.string().nullable(),
  extraction_error: z.string().nullable(),
  added_at: z.string().min(1),
});

export const PRODUCTS_CACHE_KEY = "https://mantis-preview.internal/api/products";
export const PRODUCTS_CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";
export const PRODUCT_SCANS_CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";

function siteFromUrl(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "");
}

function timestampToIso(value: string): string {
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Supabase returned an invalid product timestamp");
  }
  return timestamp.toISOString();
}

function productFromRow(value: unknown): ProductRecord {
  const row = ProductRowSchema.parse(value);
  return ProductRecordSchema.parse({
    id: row.id,
    sourceUrl: row.source_url,
    site: row.site,
    status: row.status,
    title: row.title,
    price: row.price,
    currency: row.currency,
    asin: row.external_product_id,
    seller: row.seller_name,
    extractionError: row.extraction_error,
    addedAt: timestampToIso(row.added_at),
  });
}

function toRow(product: ProductWrite) {
  return {
    source_url: product.sourceUrl,
    site: product.site,
    status: product.status,
    title: product.title,
    price: product.price,
    currency: product.currency,
    external_product_id: product.asin,
    seller_name: product.seller,
    extraction_error: product.extractionError,
    ...(product.scraperConfigurationId === undefined
      ? {}
      : { scraper_configuration_id: product.scraperConfigurationId }),
    last_extracted_at: product.status === "queued" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function responseMessage(body: string): string | undefined {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === "object" && value !== null && "message" in value) {
      return String(value.message);
    }
    if (typeof value === "object" && value !== null && "hint" in value) {
      return String(value.hint);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function workerCache(): Cache | undefined {
  if (typeof caches === "undefined") return undefined;
  return (caches as unknown as { default?: Cache }).default;
}

export function productScansCacheKey(productId: string): string {
  return `https://mantis-preview.internal/api/products/${encodeURIComponent(productId)}/scans`;
}

async function invalidateProductsCache(): Promise<void> {
  const cache = workerCache();
  if (!cache) return;

  try {
    await cache.delete(new Request(PRODUCTS_CACHE_KEY));
  } catch {}
}

export async function invalidateProductScansCache(productId: string): Promise<void> {
  const cache = workerCache();
  if (!cache) return;

  try {
    await cache.delete(new Request(productScansCacheKey(productId)));
  } catch {}
}

export async function upsertProduct(
  env: ProductPersistenceEnv,
  product: ProductWrite,
): Promise<boolean> {
  const config = supabaseConfig(env);
  if (!config) return false;
  const endpoint = `${config.url}/rest/v1/products?on_conflict=source_url`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(toRow(product)),
  });

  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase product write failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  await invalidateProductsCache();
  return true;
}

export async function listProducts(
  env: ProductPersistenceEnv,
): Promise<ProductRecord[] | undefined> {
  const config = supabaseConfig(env);
  if (!config) return undefined;

  const endpoint =
    `${config.url}/rest/v1/products?select=` +
    "id,source_url,site,status,title,price,currency,external_product_id,seller_name,extraction_error,added_at" +
    "&order=added_at.desc";
  const response = await fetch(endpoint, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase product read failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Supabase returned an invalid product list");
  }

  return payload.map(productFromRow);
}

export async function deleteProduct(
  env: ProductPersistenceEnv,
  sourceUrl: string,
): Promise<boolean> {
  const config = supabaseConfig(env);
  if (!config) return false;
  const endpoint = `${config.url}/rest/v1/products?source_url=eq.${encodeURIComponent(sourceUrl)}`;

  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Prefer: "return=minimal",
    },
  });

  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase product delete failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  await invalidateProductsCache();
  return true;
}

export function supabaseConfig(
  env: ProductPersistenceEnv,
): { url: string; key: string } | undefined {
  if (!env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) {
    return undefined;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase persistence requires both server credentials");
  }
  return {
    url: env.SUPABASE_URL.replace(/\/$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function queuedProduct(sourceUrl: string): ProductWrite {
  return {
    sourceUrl,
    site: siteFromUrl(sourceUrl),
    status: "queued",
    title: null,
    price: null,
    currency: null,
    asin: null,
    seller: null,
    extractionError: null,
  };
}

export function readyProduct(
  sourceUrl: string,
  extraction: ExtractionResult,
  scraperConfigurationId?: string | null,
): ProductWrite {
  return {
    sourceUrl,
    site: siteFromUrl(sourceUrl),
    status: "ready",
    title: extraction.title,
    price: extraction.price,
    currency: extraction.currency,
    asin: extraction.asin,
    seller: extraction.seller,
    extractionError: null,
    scraperConfigurationId,
  };
}

export function failedProduct(sourceUrl: string, error: string): ProductWrite {
  return {
    sourceUrl,
    site: siteFromUrl(sourceUrl),
    status: "failed",
    title: null,
    price: null,
    currency: null,
    asin: null,
    seller: null,
    extractionError: error,
  };
}
