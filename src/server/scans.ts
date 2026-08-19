import type { ExtractionResult } from "../domain/product";
import { supabaseConfig, type ProductPersistenceEnv } from "./products";

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

  return true;
}
