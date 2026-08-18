import type { ExtractionResult } from "../domain/product";

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
}

function siteFromUrl(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "");
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

export async function upsertProduct(
  env: ProductPersistenceEnv,
  product: ProductWrite,
): Promise<boolean> {
  if (!env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase persistence requires both server credentials");
  }

  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/products?on_conflict=source_url`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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

  return true;
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

export function readyProduct(sourceUrl: string, extraction: ExtractionResult): ProductWrite {
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
