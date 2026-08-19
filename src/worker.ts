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

export interface Env {
  ASSETS: Fetcher;
  SCRAPER: {
    extract_product(payload: { url: string; selectors?: unknown }): Promise<unknown>;
  };
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function isExtractRequest(value: unknown): value is { url: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string"
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

export async function extractWithStoredConfigurations(
  env: Env,
  sourceUrl: string,
): Promise<{ extraction: ExtractionResult; configurationId: string | null }> {
  const site = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const configurations = await listScraperConfigurations(env, site);

  for (const configuration of configurations) {
    try {
      const extraction = ExtractionResultSchema.parse(
        await env.SCRAPER.extract_product({
          url: sourceUrl,
          selectors: configuration.selectors,
        }),
      );
      return { extraction, configurationId: configuration.id };
    } catch {
      // A configuration is only reused when its deterministic extraction validates.
    }
  }

  const extraction = ExtractionResultSchema.parse(
    await env.SCRAPER.extract_product({ url: sourceUrl }),
  );
  const configuration = await saveScraperConfiguration(
    env,
    site,
    extraction,
    sourceUrl,
    configurations,
  );
  return { extraction, configurationId: configuration?.id ?? null };
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
        await upsertProduct(env, queuedProduct(sourceUrl));

        try {
          const result = await extractWithStoredConfigurations(env, sourceUrl);
          await upsertProduct(
            env,
            readyProduct(sourceUrl, result.extraction, result.configurationId),
          );
          return Response.json(result.extraction);
        } catch (error) {
          const message = safeErrorMessage(error);
          await upsertProduct(env, failedProduct(sourceUrl, message));
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
