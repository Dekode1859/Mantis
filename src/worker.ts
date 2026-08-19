import {
  ExtractionResultSchema,
  normalizeProductUrl,
  type ExtractionResult,
} from "./domain/product";
import {
  deleteProduct,
  failedProduct,
  queuedProduct,
  readyProduct,
  upsertProduct,
} from "./server/products";
import {
  listScraperConfigurations,
  saveScraperConfiguration,
} from "./server/scrapers";
import { insertProductScan } from "./server/scans";

export interface Env {
  ASSETS: Fetcher;
  SCRAPER: {
    extract_product(payload: { url: string; selectors?: unknown }): Promise<unknown>;
  };
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type ExtractionTrigger = "add" | "retry" | "scheduled" | "manual";
type ExtractionMethod = "deterministic" | "llm";

interface ExtractRequest {
  url: string;
  trigger: ExtractionTrigger;
}

interface ExtractionRoute {
  extraction: ExtractionResult;
  configurationId: string | null;
  configurationVersion: number | null;
  configurationSource: "llm" | "manual" | null;
  method: ExtractionMethod;
  model: string | null;
  durationMs: number;
}

interface ScraperFailure {
  code?: unknown;
  field?: unknown;
  message?: unknown;
}

function isExtractionTrigger(value: unknown): value is ExtractionTrigger {
  return value === "add" || value === "retry" || value === "scheduled" || value === "manual";
}

function isExtractRequest(value: unknown): value is ExtractRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string" &&
    (!("trigger" in value) || isExtractionTrigger(value.trigger))
  );
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Extraction failed";
  if (message.includes("CpuLimitExceeded") || message.includes("CPU time limit")) {
    return "The scraper exceeded its CPU budget while evaluating the page.";
  }
  if (message.includes("Traceback (most recent call last)")) {
    return "The scraper failed while evaluating the page.";
  }
  return message;
}

function scraperResultError(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return undefined;
  }
  if (value.status !== "failed") return undefined;
  if (!("error" in value)) return "The scraper returned an invalid failure response.";

  const details = value.error;
  if (typeof details === "string") return details;
  if (typeof details !== "object" || details === null) {
    return "The scraper returned an invalid failure response.";
  }

  const failure = details as ScraperFailure;
  if (typeof failure.message !== "string" || !failure.message.trim()) {
    return "The scraper returned an invalid failure response.";
  }
  if (typeof failure.field === "string" && failure.field.trim()) {
    const prefix = `${failure.field.trim()}:`;
    return failure.message.startsWith(prefix)
      ? failure.message
      : `${prefix} ${failure.message}`;
  }
  return failure.message;
}

function parseScraperResult(value: unknown): ExtractionResult {
  const failure = scraperResultError(value);
  if (failure) throw new Error(failure);
  return ExtractionResultSchema.parse(value);
}

function logExtractionAttempt(input: {
  sourceUrl: string;
  site: string;
  trigger: ExtractionTrigger;
  method: ExtractionMethod;
  status: "ready" | "failed";
  durationMs: number;
  model: string | null;
  configurationId: string | null;
  configurationVersion: number | null;
  configurationSource: "llm" | "manual" | null;
  error?: string;
}) {
  console.log({
    event: "product_extraction_attempt",
    timestamp: new Date().toISOString(),
    source_url: input.sourceUrl,
    site: input.site,
    trigger: input.trigger,
    actor: input.trigger === "scheduled" ? "scheduler" : "user",
    method: input.method,
    status: input.status,
    duration_ms: input.durationMs,
    model: input.model,
    configuration_id: input.configurationId,
    configuration_version: input.configurationVersion,
    configuration_source: input.configurationSource,
    ...(input.error ? { error: input.error } : {}),
  });
}

function actorForTrigger(trigger: ExtractionTrigger): "user" | "scheduler" {
  return trigger === "scheduled" ? "scheduler" : "user";
}

export async function extractWithStoredConfigurations(
  env: Env,
  sourceUrl: string,
  trigger: ExtractionTrigger = "manual",
): Promise<ExtractionRoute> {
  const site = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const configurations = await listScraperConfigurations(env, site);
  const deterministicFailures: string[] = [];

  for (const configuration of configurations) {
    const startedAt = Date.now();
    try {
      const extraction = parseScraperResult(
        await env.SCRAPER.extract_product({
          url: sourceUrl,
          selectors: configuration.selectors,
        }),
      );
      logExtractionAttempt({
        sourceUrl,
        site,
        trigger,
        method: "deterministic",
        status: "ready",
        durationMs: Date.now() - startedAt,
        model: configuration.model,
        configurationId: configuration.id,
        configurationVersion: configuration.version,
        configurationSource: configuration.source,
      });
      return {
        extraction,
        configurationId: configuration.id,
        configurationVersion: configuration.version,
        configurationSource: configuration.source,
        method: "deterministic",
        model: configuration.model,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      logExtractionAttempt({
        sourceUrl,
        site,
        trigger,
        method: "deterministic",
        status: "failed",
        durationMs: Date.now() - startedAt,
        model: configuration.model,
        configurationId: configuration.id,
        configurationVersion: configuration.version,
        configurationSource: configuration.source,
        error: safeErrorMessage(error),
      });
      deterministicFailures.push(
        `${configuration.id} (v${configuration.version}): ${safeErrorMessage(error)}`,
      );
    }
  }

  const startedAt = Date.now();
  let extraction: ExtractionResult;
  try {
    extraction = parseScraperResult(
      await env.SCRAPER.extract_product({ url: sourceUrl }),
    );
  } catch (error) {
    logExtractionAttempt({
      sourceUrl,
      site,
      trigger,
      method: "llm",
      status: "failed",
      durationMs: Date.now() - startedAt,
      model: null,
      configurationId: null,
      configurationVersion: null,
      configurationSource: null,
      error: safeErrorMessage(error),
    });
    const deterministicMessage = deterministicFailures.length
      ? ` Deterministic configurations failed: ${deterministicFailures.join("; ")}.`
      : "";
    throw new Error(`${safeErrorMessage(error)}${deterministicMessage}`);
  }

  const configuration = await saveScraperConfiguration(
    env,
    site,
    extraction,
    sourceUrl,
    configurations,
  );
  logExtractionAttempt({
    sourceUrl,
    site,
    trigger,
    method: "llm",
    status: "ready",
    durationMs: Date.now() - startedAt,
    model: extraction.model ?? null,
    configurationId: configuration?.id ?? null,
    configurationVersion: configuration?.version ?? null,
    configurationSource: configuration?.source ?? null,
  });
  return {
    extraction,
    configurationId: configuration?.id ?? null,
    configurationVersion: configuration?.version ?? null,
    configurationSource: configuration?.source ?? null,
    method: "llm",
    model: extraction.model ?? null,
    durationMs: Date.now() - startedAt,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "mantis-ui" });
    }

    if (url.pathname === "/api/extract") {
      if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      try {
        const payload: unknown = await request.json();
        if (!isExtractRequest(payload)) {
          return Response.json({ error: "A product URL is required" }, { status: 400 });
        }

        const sourceUrl = normalizeProductUrl(payload.url).toString();
        const trigger = payload.trigger ?? "manual";
        const scanStartedAt = Date.now();
        await upsertProduct(env, queuedProduct(sourceUrl));

        try {
          const result = await extractWithStoredConfigurations(env, sourceUrl, trigger);
          await upsertProduct(
            env,
            readyProduct(sourceUrl, result.extraction, result.configurationId),
          );
          await insertProductScan(env, {
            sourceUrl,
            scraperConfigurationId: result.configurationId,
            method: result.method,
            trigger,
            actor: actorForTrigger(trigger),
            status: "ready",
            extraction: result.extraction,
            model: result.model,
            durationMs: result.durationMs,
            extractionError: null,
          });
          return Response.json(result.extraction);
        } catch (error) {
          const message = safeErrorMessage(error);
          await upsertProduct(env, failedProduct(sourceUrl, message));
          await insertProductScan(env, {
            sourceUrl,
            scraperConfigurationId: null,
            method: "llm",
            trigger,
            actor: actorForTrigger(trigger),
            status: "failed",
            extraction: null,
            model: null,
            durationMs: Date.now() - scanStartedAt,
            extractionError: message,
          });
          return Response.json({ error: message }, { status: 502 });
        }
      } catch (error) {
        return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
      }
    }

    if (url.pathname === "/api/products") {
      if (request.method !== "DELETE") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      const sourceUrlInput = url.searchParams.get("source_url");
      if (!sourceUrlInput) {
        return Response.json({ error: "A product URL is required" }, { status: 400 });
      }

      try {
        const sourceUrl = normalizeProductUrl(sourceUrlInput).toString();
        await deleteProduct(env, sourceUrl);
        return Response.json({ deleted: true });
      } catch (error) {
        return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
