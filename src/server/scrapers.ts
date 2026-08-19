import {
  ScraperConfigurationSchema,
  type ExtractionResult,
  type ScraperConfiguration,
} from "../domain/product";
import { supabaseConfig, type ProductPersistenceEnv } from "./products";

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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

async function configurationHash(selectors: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalize(selectors)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function configurationsUrl(baseUrl: string, site: string): URL {
  const url = new URL(`${baseUrl}/rest/v1/scraper_configurations`);
  url.searchParams.set(
    "select",
    "id,site,version,configuration_hash,selectors,model,source,metadata,created_at",
  );
  url.searchParams.set("site", `eq.${site}`);
  url.searchParams.set("order", "version.asc");
  return url;
}

function authHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export async function listScraperConfigurations(
  env: ProductPersistenceEnv,
  site: string,
): Promise<ScraperConfiguration[]> {
  const config = supabaseConfig(env);
  if (!config) return [];

  const response = await fetch(configurationsUrl(config.url, site), {
    headers: authHeaders(config.key),
  });
  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase scraper configuration read failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Supabase returned invalid scraper configurations");
  return payload.map((item) => ScraperConfigurationSchema.parse(item));
}

export async function saveScraperConfiguration(
  env: ProductPersistenceEnv,
  site: string,
  extraction: ExtractionResult,
  sourceUrl: string,
  existing: ScraperConfiguration[],
): Promise<ScraperConfiguration | null> {
  const config = supabaseConfig(env);
  if (!config) return null;
  if (!extraction.selectors || !extraction.model) {
    throw new Error("The scraper did not return selectors and model metadata");
  }

  const hash = await configurationHash(extraction.selectors);
  const known = existing.find((item) => item.configuration_hash === hash);
  if (known) return known;

  const version = existing.reduce((highest, item) => Math.max(highest, item.version), 0) + 1;
  const response = await fetch(`${config.url}/rest/v1/scraper_configurations`, {
    method: "POST",
    headers: {
      ...authHeaders(config.key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      site,
      version,
      configuration_hash: hash,
      selectors: extraction.selectors,
      model: extraction.model,
      source: "llm",
      metadata: {
        created_for_url: sourceUrl,
        reason: "no_existing_deterministic_configuration_succeeded",
      },
    }),
  });

  if (!response.ok) {
    const message = responseMessage(await response.text());
    throw new Error(
      `Supabase scraper configuration write failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Supabase returned an invalid scraper configuration");
  }
  return ScraperConfigurationSchema.parse(payload[0]);
}
