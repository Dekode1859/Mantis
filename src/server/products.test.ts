import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteProduct,
  failedProduct,
  listProducts,
  queuedProduct,
  readyProduct,
  upsertProduct,
} from "./products";

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

  it("preserves prior extraction fields when a refresh is queued or fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
    };

    await upsertProduct(env, queuedProduct("https://www.amazon.in/dp/B0GD6QSD4M"));
    await upsertProduct(
      env,
      failedProduct("https://www.amazon.in/dp/B0GD6QSD4M", "price was unavailable"),
    );

    const queuedBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const failedBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(queuedBody).toMatchObject({
      source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
      status: "queued",
      extraction_error: null,
    });
    expect(queuedBody).not.toHaveProperty("title");
    expect(queuedBody).not.toHaveProperty("price");
    expect(queuedBody).not.toHaveProperty("last_extracted_at");
    expect(failedBody).toMatchObject({
      status: "failed",
      extraction_error: "price was unavailable",
    });
    expect(failedBody).not.toHaveProperty("title");
    expect(failedBody).not.toHaveProperty("price");
    expect(failedBody).not.toHaveProperty("last_extracted_at");
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

  it("validates and maps database products into card records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            source_url: "https://www.amazon.in/dp/B0GD6QSD4M",
            site: "amazon.in",
            status: "ready",
            title: "Power bank",
            price: "3,499.00",
            currency: "INR",
            external_product_id: "B0GD6QSD4M",
            seller_name: "Example seller",
            extraction_error: null,
            added_at: "2026-08-19 00:00:00+00",
            last_extracted_at: "2026-08-19 00:05:00+00",
            updated_at: "2026-08-19 00:05:00+00",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listProducts({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        sourceUrl: "https://www.amazon.in/dp/B0GD6QSD4M",
        price: 3499,
        currency: "INR",
        lastExtractedAt: "2026-08-19T00:05:00.000Z",
        lastAttemptedAt: "2026-08-19T00:05:00.000Z",
        addedAt: "2026-08-19T00:00:00.000Z",
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/products?select=id,source_url,site,status,title,price,currency,external_product_id,seller_name,extraction_error,added_at,last_extracted_at,updated_at&order=added_at.desc",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "server-only-test-key",
          Authorization: "Bearer server-only-test-key",
        }),
      }),
    );
  });

  it("rejects malformed database products", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "not-a-valid-row",
              source_url: "https://example.com/item",
              site: "example.com",
              status: "ready",
              title: "Example",
              price: "not-a-price",
              currency: "USD",
              external_product_id: null,
              seller_name: null,
              extraction_error: null,
              added_at: "2026-08-19T00:00:00.000Z",
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(
      listProducts({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
      }),
    ).rejects.toThrow();
  });
});
