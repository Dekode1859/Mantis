import {
  ExtractionResultSchema,
  normalizeProductUrl,
  type ExtractionResult,
} from "./domain/product";
import {
  deleteProduct,
  failedProduct,
  listProducts,
  productScansCacheKey,
  PRODUCTS_CACHE_CONTROL,
  PRODUCTS_CACHE_KEY,
  PRODUCT_SCANS_CACHE_CONTROL,
  queuedProduct,
  readyProduct,
  upsertProduct,
} from "./server/products";
import {
  listScraperConfigurations,
  saveScraperConfiguration,
} from "./server/scrapers";
import {
  isProductId,
  listProductScans,
  insertProductScan,
} from "./server/scans";

export interface Env {
  ASSETS: Fetcher;
  SCRAPER?: ScraperBinding;
  REFRESH_QUEUE?: Queue<RefreshQueueMessage>;
  APP_URL?: string;
  SCRAPER_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type ExtractionTrigger = "add" | "retry" | "scheduled" | "manual";
type ExtractionMethod = "deterministic" | "llm";

interface ScraperBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface RefreshQueueMessage {
  sourceUrl: string;
  scheduledAt: string;
}

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

type ProductExtractionProcess =
  | { ok: true; result: ExtractionRoute }
  | { ok: false; error: string };

export interface ScheduledRefreshSummary {
  scheduledAt: string;
  productCount: number;
  succeeded: number;
  failed: number;
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

async function callScraper(
  env: Env,
  payload: { url: string; selectors?: unknown },
): Promise<unknown> {
  const endpoint = env.SCRAPER_URL
    ? new URL("/api/extract", env.SCRAPER_URL).toString()
    : "https://mantis-scraper/api/extract";
  const response = env.SCRAPER_URL
    ? await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    : await env.SCRAPER?.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
  if (!response) throw new Error("The scraper service is not configured.");
  return response.json();
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
        await callScraper(env, {
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

  if (trigger === "scheduled") {
    const message = deterministicFailures.length
      ? `Deterministic configurations failed: ${deterministicFailures.join("; ")}.`
      : "No deterministic scraper configuration is available for scheduled refresh.";
    throw new Error(message);
  }

  const startedAt = Date.now();
  let extraction: ExtractionResult;
  try {
    extraction = parseScraperResult(
      await callScraper(env, { url: sourceUrl }),
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

async function processProductExtraction(
  env: Env,
  sourceUrl: string,
  trigger: ExtractionTrigger,
): Promise<ProductExtractionProcess> {
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
    return { ok: true, result };
  } catch (error) {
    const message = safeErrorMessage(error);
    await upsertProduct(env, failedProduct(sourceUrl, message));
    await insertProductScan(env, {
      sourceUrl,
      scraperConfigurationId: null,
      method: trigger === "scheduled" ? "deterministic" : "llm",
      trigger,
      actor: actorForTrigger(trigger),
      status: "failed",
      extraction: null,
      model: null,
      durationMs: Date.now() - scanStartedAt,
      extractionError: message,
    });
    return { ok: false, error: message };
  }
}

export async function runScheduledRefresh(
  env: Env,
  scheduledAt = new Date(),
): Promise<ScheduledRefreshSummary> {
  const products = await listProducts(env);
  const scheduledAtIso = scheduledAt.toISOString();
  if (!products) {
    const summary = {
      scheduledAt: scheduledAtIso,
      productCount: 0,
      succeeded: 0,
      failed: 0,
    };
    console.log({ event: "scheduled_refresh", status: "skipped", ...summary });
    return summary;
  }

  let succeeded = 0;
  let failed = 0;
  for (const product of products) {
    try {
      const result = await processProductExtraction(env, product.sourceUrl, "scheduled");
      if (result.ok) {
        succeeded += 1;
      } else {
        failed += 1;
      }
      console.log({
        event: "scheduled_product_refresh",
        scheduled_at: scheduledAtIso,
        source_url: product.sourceUrl,
        status: result.ok ? "ready" : "failed",
        ...(result.ok ? {} : { error: result.error }),
      });
    } catch (error) {
      failed += 1;
      console.log({
        event: "scheduled_product_refresh",
        scheduled_at: scheduledAtIso,
        source_url: product.sourceUrl,
        status: "failed",
        error: safeErrorMessage(error),
      });
    }
  }

  const summary = {
    scheduledAt: scheduledAtIso,
    productCount: products.length,
    succeeded,
    failed,
  };
  console.log({ event: "scheduled_refresh", status: "completed", ...summary });
  return summary;
}

export async function enqueueScheduledRefresh(
  env: Env,
  scheduledAt = new Date(),
): Promise<ScheduledRefreshSummary> {
  const products = await listProducts(env);
  const scheduledAtIso = scheduledAt.toISOString();
  if (!products) {
    const summary = {
      scheduledAt: scheduledAtIso,
      productCount: 0,
      succeeded: 0,
      failed: 0,
    };
    console.log({ event: "scheduled_refresh", status: "skipped", ...summary });
    return summary;
  }

  if (!env.REFRESH_QUEUE) return runScheduledRefresh(env, scheduledAt);

  await env.REFRESH_QUEUE.sendBatch(
    products.map((product, index) => ({
      body: {
        sourceUrl: product.sourceUrl,
        scheduledAt: scheduledAtIso,
      },
      delaySeconds: index * 10,
    })),
  );

  const summary = {
    scheduledAt: scheduledAtIso,
    productCount: products.length,
    succeeded: 0,
    failed: 0,
  };
  console.log({
    event: "scheduled_refresh",
    status: "queued",
    ...summary,
  });
  return summary;
}

function isRefreshQueueMessage(value: unknown): value is RefreshQueueMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourceUrl" in value &&
    typeof value.sourceUrl === "string" &&
    "scheduledAt" in value &&
    typeof value.scheduledAt === "string"
  );
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
        const result = await processProductExtraction(env, sourceUrl, trigger);
        return result.ok
          ? Response.json(result.result.extraction)
          : Response.json({ error: result.error }, { status: 502 });
      } catch (error) {
        return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
      }
    }

    if (url.pathname === "/api/products") {
      if (request.method === "GET") {
        try {
          const cacheKey = new Request(PRODUCTS_CACHE_KEY);
          const cache =
            typeof caches === "undefined"
              ? undefined
              : (caches as unknown as { default?: Cache }).default;
          const cached = cache ? await cache.match(cacheKey) : undefined;
          if (cached) return cached;

          const products = await listProducts(env);
          if (!products) {
            return Response.json(
              { error: "Supabase persistence is not configured." },
              { status: 503 },
            );
          }

          const response = Response.json(products, {
            headers: {
              "Cache-Control": PRODUCTS_CACHE_CONTROL,
              "X-Products-Source": "database",
            },
          });
          if (cache) {
            try {
              await cache.put(cacheKey, response.clone());
            } catch {}
          }
          return response;
        } catch (error) {
          return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
        }
      }

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

    const scansMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/scans$/);
    if (scansMatch) {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      let productId: string;
      try {
        productId = decodeURIComponent(scansMatch[1]);
      } catch {
        return Response.json({ error: "A valid product ID is required" }, { status: 400 });
      }
      if (!isProductId(productId)) {
        return Response.json({ error: "A valid product ID is required" }, { status: 400 });
      }

      try {
        const cacheKey = new Request(productScansCacheKey(productId));
        const cache =
          typeof caches === "undefined"
            ? undefined
            : (caches as unknown as { default?: Cache }).default;
        const cached = cache ? await cache.match(cacheKey) : undefined;
        if (cached) return cached;

        const scans = await listProductScans(env, productId);
        if (!scans) {
          return Response.json(
            { error: "Supabase persistence is not configured." },
            { status: 503 },
          );
        }

        const response = Response.json(scans, {
          headers: {
            "Cache-Control": PRODUCT_SCANS_CACHE_CONTROL,
            "X-Product-Scans-Source": "database",
          },
        });
        if (cache) {
          try {
            await cache.put(cacheKey, response.clone());
          } catch {}
        }
        return response;
      } catch (error) {
        return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await enqueueScheduledRefresh(env, new Date(controller.scheduledTime));
    } catch (error) {
      console.log({
        event: "scheduled_refresh",
        status: "failed",
        scheduled_at: new Date(controller.scheduledTime).toISOString(),
        error: safeErrorMessage(error),
      });
    }
  },

  async queue(batch: MessageBatch<RefreshQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!isRefreshQueueMessage(message.body)) {
        console.log({
          event: "scheduled_product_refresh",
          status: "failed",
          error: "Invalid refresh queue message",
        });
        message.ack();
        continue;
      }

      if (!env.APP_URL) {
        throw new Error("The application URL is not configured for queued refreshes.");
      }

      const response = await fetch(new URL("/api/extract", env.APP_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: message.body.sourceUrl,
          trigger: "scheduled",
        }),
      });
      const responseBody = await response.text();
      console.log({
        event: "scheduled_product_refresh",
        scheduled_at: message.body.scheduledAt,
        source_url: message.body.sourceUrl,
        status: response.ok ? "ready" : "failed",
        ...(response.ok ? {} : { error: responseBody.slice(0, 500) }),
      });
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, RefreshQueueMessage>;
