import { afterEach, describe, expect, it, vi } from "vitest";

import { extractWithStoredConfigurations, type Env } from "./worker";

const envBase = {
  ASSETS: {} as Fetcher,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
};

const selectors = {
  title: { selector: "#title", operation: "text", attribute: null },
  price: { selector: "#price", operation: "text", attribute: null },
  asin: { selector: "#asin", operation: "text", attribute: null },
  seller: { selector: "#seller", operation: "text", attribute: null },
};

const configuration = {
  id: "11111111-1111-4111-8111-111111111111",
  site: "example.com",
  version: 1,
  configuration_hash: "a".repeat(64),
  selectors,
  model: "gpt-oss:120b",
  source: "llm" as const,
  metadata: {},
  created_at: "2026-08-19T00:00:00.000Z",
};

const extraction = {
  status: "ready" as const,
  source_url: "https://example.com/item",
  title: "Example item",
  price: 100,
  currency: "INR",
  asin: null,
  seller: null,
  selectors,
  model: "gpt-oss:120b",
};

describe("stored scraper configuration selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses a stored configuration before calling the LLM path", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([configuration]), { status: 200 }));
    const scraper = {
      extract_product: vi.fn().mockResolvedValue(extraction),
    };
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractWithStoredConfigurations(
      { ...envBase, SCRAPER: scraper } as Env,
      extraction.source_url,
      "add",
    );

    expect(result).toEqual({
      extraction,
      configurationId: configuration.id,
      configurationVersion: configuration.version,
      configurationSource: configuration.source,
      method: "deterministic",
      model: configuration.model,
    });
    expect(scraper.extract_product).toHaveBeenCalledOnce();
    expect(scraper.extract_product).toHaveBeenCalledWith({
      url: extraction.source_url,
      selectors,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "product_extraction_attempt",
        method: "deterministic",
        status: "ready",
        trigger: "add",
        actor: "user",
        configuration_id: configuration.id,
      }),
    );
  });

  it("falls back to the LLM result and stores its configuration", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const savedConfiguration = { ...configuration, id: "22222222-2222-4222-8222-222222222222" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([savedConfiguration]), { status: 201 }));
    const scraper = {
      extract_product: vi.fn().mockResolvedValue(extraction),
    };
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractWithStoredConfigurations(
      { ...envBase, SCRAPER: scraper } as Env,
      extraction.source_url,
    );

    expect(result.configurationId).toBe(savedConfiguration.id);
    expect(result.method).toBe("llm");
    expect(scraper.extract_product).toHaveBeenCalledWith({ url: extraction.source_url });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "product_extraction_attempt",
        method: "llm",
        status: "ready",
        configuration_id: savedConfiguration.id,
      }),
    );
  });
});
