import { ProductScanSchema, type ExtractionResult, type ProductScan } from "../domain/product";
import { z } from "zod";
import {
  invalidateProductScansCache,
  supabaseConfig,
  type ProductPersistenceEnv,
} from "./products";

export type ScanMethod = "deterministic" | "llm";
export type ScanTrigger = "add" | "retry" | "scheduled" | "manual";
export type ScanActor = "user" | "scheduler" | "system";

export interface ProductScanWrite {
  sourceUrl: string;
  scraperConfigurationId: string | null;
  method: ScanMethod;
  trigger: ScanTrigger;
  actor: ScanActor;
  status: "ready" | "failed";
  extraction: ExtractionResult | null;
  model: string | null;
  durationMs: number;
  extractionError: string | null;
}

const ProductScanRowSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  scraper_configuration_id: z.string().uuid().nullable(),
  extraction_method: z.enum(["deterministic", "llm"]),
  trigger: z.enum(["add", "retry", "scheduled", "manual"]),
  actor: z.enum(["user", "scheduler", "system"]),
  status: z.enum(["ready", "failed"]),
  title: z.string().nullable(),
  price: z.union([z.number(), z.string()]).nullable(),
  currency: z.string().nullable(),
  model: z.string().nullable(),
  duration_ms: z.number().int().nonnegative(),
  extraction_error: z.string().nullable(),
  scanned_at: z.string().min(1),
});

const ProductIdSchema = z.string().uuid();

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

function timestampToIso(value: string): string {
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Supabase returned an invalid scan timestamp");
  }
  return timestamp.toISOString();
}

function scanFromRow(value: unknown): ProductScan {
  const row = ProductScanRowSchema.parse(value);
  return ProductScanSchema.parse({
    id: row.id,
    productId: row.product_id,
    scraperConfigurationId: row.scraper_configuration_id,
    method: row.extraction_method,
    trigger: row.trigger,
    actor: row.actor,
    status: row.status,
    title: row.title,
    price: row.price,
    currency: row.currency,
    model: row.model,
    durationMs: row.duration_ms,
    extractionError: row.extraction_error,
    scannedAt: timestampToIso(row.scanned_at),
  });
}

export function isProductId(value: string): boolean {
  return ProductIdSchema.safeParse(value).success;
}

export async function listProductScans(
  env: ProductPersistenceEnv,
  productId: string,
  limit = 50,
): Promise<ProductScan[] | undefined> {
  const config = supabaseConfig(env);
  if (!config) return undefined;
  ProductIdSchema.parse(productId);

  const endpoint = new URL(`${config.url}/rest/v1/product_scans`);
  endpoint.searchParams.set(
    "select",
    "id,product_id,scraper_configuration_id,extraction_method,trigger,actor,status,title,price,currency,model,duration_ms,extraction_error,scanned_at",
  );
  endpoint.searchParams.set("product_id", `eq.${productId}`);
  endpoint.searchParams.set("order", "scanned_at.desc");
  endpoint.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));

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
      `Supabase product scan read failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Supabase returned an invalid product scan list");
  }
  return payload.map(scanFromRow);
}

async function findProductId(
  config: { url: string; key: string },
  sourceUrl: string,
): Promise<string> {
  const endpoint = new URL(`${config.url}/rest/v1/products`);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("source_url", `eq.${sourceUrl}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });
  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase product lookup failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Supabase product lookup returned no unique product");
  }
  const product = payload[0];
  if (
    typeof product !== "object" ||
    product === null ||
    !("id" in product) ||
    typeof product.id !== "string"
  ) {
    throw new Error("Supabase product lookup returned an invalid product");
  }
  return product.id;
}

export async function insertProductScan(
  env: ProductPersistenceEnv,
  scan: ProductScanWrite,
): Promise<boolean> {
  const config = supabaseConfig(env);
  if (!config) return false;

  const productId = await findProductId(config, scan.sourceUrl);
  const extraction = scan.extraction;
  const response = await fetch(`${config.url}/rest/v1/product_scans`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      product_id: productId,
      scraper_configuration_id: scan.scraperConfigurationId,
      extraction_method: scan.method,
      trigger: scan.trigger,
      actor: scan.actor,
      status: scan.status,
      title: extraction?.title ?? null,
      price: extraction?.price ?? null,
      currency: extraction?.currency ?? null,
      external_product_id: extraction?.asin ?? null,
      seller_name: extraction?.seller ?? null,
      model: scan.model,
      duration_ms: scan.durationMs,
      extraction_error: scan.extractionError,
    }),
  });

  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase product scan write failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  await invalidateProductScansCache(productId);
  return true;
}
