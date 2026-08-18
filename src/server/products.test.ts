import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteProduct, readyProduct, upsertProduct } from "./products";

describe("product persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips persistence when server credentials are not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertProduct(
        {},
        readyProduct("https://www.amazon.in/dp/B0GD6QSD4M", {
          status: "ready",
          source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
          title: "Power bank",
          price: 3499,
          currency: "INR",
          asin: "B0GD6QSD4M",
          seller: null,
        }),
      ),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upserts normalized fields through the Supabase REST API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const product = readyProduct("https://www.amazon.in/dp/B0GD6QSD4M", {
      status: "ready",
      source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
      title: "Power bank",
      price: 3499,
      currency: "INR",
      asin: "B0GD6QSD4M",
      seller: null,
    });

    await expect(
      upsertProduct(
        {
          SUPABASE_URL: "https://example.supabase.co/",
          SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
        },
        product,
      ),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(
      "https://example.supabase.co/rest/v1/products?on_conflict=source_url",
    );
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      apikey: "server-only-test-key",
      Authorization: "Bearer server-only-test-key",
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
      site: "amazon.in",
      status: "ready",
      price: 3499,
      currency: "INR",
      external_product_id: "B0GD6QSD4M",
    });
  });

  it("rejects partially configured server credentials", async () => {
    await expect(
      upsertProduct(
        { SUPABASE_URL: "https://example.supabase.co" },
        readyProduct("https://www.amazon.in/dp/B0GD6QSD4M", {
          status: "ready",
          source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
          title: "Power bank",
          price: 3499,
          currency: "INR",
          asin: "B0GD6QSD4M",
          seller: null,
        }),
      ),
    ).rejects.toThrow("both server credentials");
  });

  it("deletes a product through the Supabase REST API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteProduct(
        {
          SUPABASE_URL: "https://example.supabase.co/",
          SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
        },
        "https://www.amazon.in/dp/B0GD6QSD4M",
      ),
    ).resolves.toBe(true);

    const [endpoint, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(
      "https://example.supabase.co/rest/v1/products?source_url=eq.https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0GD6QSD4M",
    );
    expect(request.method).toBe("DELETE");
    expect(request.headers).toMatchObject({
      apikey: "server-only-test-key",
      Authorization: "Bearer server-only-test-key",
      Prefer: "return=minimal",
    });
  });
});
