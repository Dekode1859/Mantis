interface Env {
  ASSETS: Fetcher;
  SCRAPER: {
    extract_product(payload: { url: string }): Promise<unknown>;
  };
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
        return Response.json(await env.SCRAPER.extract_product(payload));
      } catch (error) {
        return Response.json({ error: safeErrorMessage(error) }, { status: 502 });
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
