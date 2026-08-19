import { afterEach, describe, expect, it, vi } from "vitest";

import { insertProductScan, listProductScans } from "./scans";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
};

describe("product scan persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores compact metadata linked to the product row", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      insertProductScan(env, {
        sourceUrl: "https://www.amazon.in/dp/B0GD6QSD4M",
        scraperConfigurationId: "22222222-2222-4222-8222-222222222222",
        method: "deterministic",
        trigger: "retry",
        actor: "user",
        status: "ready",
        extraction: {
          status: "ready",
          source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
          title: "Power bank",
          price: 3499,
          currency: "INR",
          asin: "B0GD6QSD4M",
          seller: null,
        },
        model: "gpt-oss:120b",
        durationMs: 2247,
        extractionError: null,
      }),
    ).resolves.toBe(true);

    const [lookupEndpoint] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(lookupEndpoint.toString()).toContain("source_url=eq.https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0GD6QSD4M");

    const [scanEndpoint, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(scanEndpoint).toBe("https://example.supabase.co/rest/v1/product_scans");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      product_id: "11111111-1111-4111-8111-111111111111",
      scraper_configuration_id: "22222222-2222-4222-8222-222222222222",
      extraction_method: "deterministic",
      trigger: "retry",
      actor: "user",
      status: "ready",
      title: "Power bank",
      price: 3499,
      currency: "INR",
      external_product_id: "B0GD6QSD4M",
      seller_name: null,
      model: "gpt-oss:120b",
      duration_ms: 2247,
      extraction_error: null,
    });
  });

  it("reads and validates compact scan history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "33333333-3333-4333-8333-333333333333",
            product_id: "11111111-1111-4111-8111-111111111111",
            scraper_configuration_id: "22222222-2222-4222-8222-222222222222",
            extraction_method: "deterministic",
            trigger: "retry",
            actor: "user",
            status: "ready",
            title: "Power bank",
            price: "3,499.00",
            currency: "INR",
            model: "gpt-oss:120b",
            duration_ms: 2247,
            extraction_error: null,
            scanned_at: "2026-08-19 00:00:00+00",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listProductScans(env, "11111111-1111-4111-8111-111111111111"),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: "11111111-1111-4111-8111-111111111111",
        method: "deterministic",
        price: 3499,
        scannedAt: "2026-08-19T00:00:00.000Z",
      }),
    ]);

    const [endpoint] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.searchParams.get("product_id")).toBe(
      "eq.11111111-1111-4111-8111-111111111111",
    );
    expect(endpoint.searchParams.get("limit")).toBe("50");
  });

  it("rejects a scan history request for a non-UUID product ID", async () => {
    await expect(listProductScans(env, "https://example.com/item")).rejects.toThrow();
  });
});
