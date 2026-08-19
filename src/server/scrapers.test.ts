import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listScraperConfigurations,
  saveScraperConfiguration,
} from "./scrapers";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
};

const selectors = {
  title: { selector: "#title", operation: "text", attribute: null },
  price: { selector: "#price", operation: "text", attribute: null },
  asin: { selector: "#asin", operation: "text", attribute: null },
  seller: { selector: "#seller", operation: "text", attribute: null },
} as const;

const configuration = {
  id: "11111111-1111-4111-8111-111111111111",
  site: "amazon.in",
  version: 1,
  configuration_hash: "a".repeat(64),
  selectors,
  model: "gpt-oss:120b",
  source: "llm",
  metadata: { created_for_url: "https://www.amazon.in/dp/B0GD6QSD4M" },
  created_at: "2026-08-19T00:00:00.000Z",
};

describe("scraper configuration persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists configurations for a site", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([configuration]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listScraperConfigurations(env, "amazon.in")).resolves.toEqual([
      configuration,
    ]);

    const [endpoint, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.toString()).toContain("site=eq.amazon.in");
    expect(endpoint.toString()).toContain("order=version.asc");
    expect(request.headers).toMatchObject({
      apikey: "server-only-test-key",
      Authorization: "Bearer server-only-test-key",
    });
  });

  it("accepts Supabase timestamp formatting at the persistence boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ ...configuration, created_at: "2026-08-19 00:00:00+00" }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listScraperConfigurations(env, "amazon.in")).resolves.toHaveLength(1);
  });

  it("stores a new LLM configuration with a deterministic hash", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([configuration]), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const extraction = {
      status: "ready" as const,
      source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
      title: "Power bank",
      price: 3499,
      currency: "INR",
      asin: "B0GD6QSD4M",
      seller: null,
      selectors,
      model: "gpt-oss:120b",
    };

    await expect(
      saveScraperConfiguration(
        env,
        "amazon.in",
        extraction,
        extraction.source_url,
        [],
      ),
    ).resolves.toEqual(configuration);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      site: "amazon.in",
      version: 1,
      selectors,
      model: "gpt-oss:120b",
      source: "llm",
    });
    expect(body.configuration_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
