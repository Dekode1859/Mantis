import { afterEach, describe, expect, it, vi } from "vitest";

import worker, {
  enqueueScheduledRefresh,
  extractWithStoredConfigurations,
  runScheduledRefresh,
  type Env,
  type RefreshQueueMessage,
} from "./worker";

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
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 })),
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
      durationMs: expect.any(Number),
    });
    expect(scraper.fetch).toHaveBeenCalledOnce();
    expect(scraper.fetch).toHaveBeenCalledWith(
      "https://mantis-scraper/api/extract",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: extraction.source_url, selectors }),
      }),
    );
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

  it("preserves a field-level deterministic failure before falling back", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const savedConfiguration = { ...configuration, id: "22222222-2222-4222-8222-222222222222" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([configuration]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([savedConfiguration]), { status: 201 }));
    const scraper = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              status: "failed",
              error: {
                code: "validation_error",
                field: "price",
                message: "price: selector matched no nodes",
              },
            }),
        })
        .mockResolvedValueOnce(
          new Response(JSON.stringify(extraction), { status: 200 }),
        ),
    };
    vi.stubGlobal("fetch", fetchMock);

    await extractWithStoredConfigurations(
      { ...envBase, SCRAPER: scraper } as Env,
      extraction.source_url,
      "retry",
    );

    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "product_extraction_attempt",
        method: "deterministic",
        status: "failed",
        configuration_id: configuration.id,
        error: "price: selector matched no nodes",
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
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 })),
    };
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractWithStoredConfigurations(
      { ...envBase, SCRAPER: scraper } as Env,
      extraction.source_url,
    );

    expect(result.configurationId).toBe(savedConfiguration.id);
    expect(result.method).toBe("llm");
    expect(scraper.fetch).toHaveBeenCalledWith(
      "https://mantis-scraper/api/extract",
      expect.objectContaining({
        body: JSON.stringify({ url: extraction.source_url }),
      }),
    );
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

  it("does not invoke the LLM fallback during scheduled refreshes", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([configuration]), { status: 200 }));
    const scraper = {
      fetch: vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: "failed",
            error: {
              code: "extraction_error",
              message: "The scraper exceeded its CPU budget while evaluating the page.",
            },
          }),
      }),
    };
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractWithStoredConfigurations(
        { ...envBase, SCRAPER: scraper } as Env,
        extraction.source_url,
        "scheduled",
      ),
    ).rejects.toThrow("Deterministic configurations failed:");

    expect(scraper.fetch).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "product_extraction_attempt",
        method: "deterministic",
        status: "failed",
        trigger: "scheduled",
      }),
    );
  });
});

describe("product API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns validated products from the persistence layer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "11111111-1111-4111-8111-111111111111",
              source_url: "https://example.com/item",
              site: "example.com",
              status: "ready",
              title: "Example item",
              price: 100,
              currency: "INR",
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

    const response = await worker.fetch(
      new Request("https://mantis-preview.example/api/products"),
      {
        ...envBase,
        SCRAPER: { fetch: vi.fn() },
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        sourceUrl: "https://example.com/item",
        title: "Example item",
        price: 100,
        currency: "INR",
      }),
    ]);
  });

  it("loads scan history only through the explicit history endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "33333333-3333-4333-8333-333333333333",
              product_id: "11111111-1111-4111-8111-111111111111",
              scraper_configuration_id: null,
              extraction_method: "llm",
              trigger: "add",
              actor: "user",
              status: "ready",
              title: "Example item",
              price: 100,
              currency: "INR",
              model: "gpt-oss:120b",
              duration_ms: 500,
              extraction_error: null,
              scanned_at: "2026-08-19T00:00:00.000Z",
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://mantis-preview.example/api/products/11111111-1111-4111-8111-111111111111/scans",
      ),
      {
        ...envBase,
        SCRAPER: { fetch: vi.fn() },
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        method: "llm",
        trigger: "add",
        durationMs: 500,
      }),
    ]);
  });

  it("refreshes every stored product with the scheduled trigger", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "11111111-1111-4111-8111-111111111111",
              source_url: "https://example.com/item",
              site: "example.com",
              status: "ready",
              title: "Example item",
              price: 100,
              currency: "INR",
              external_product_id: null,
              seller_name: null,
              extraction_error: null,
              added_at: "2026-08-19T00:00:00.000Z",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([configuration]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const scraper = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 })),
    };
    vi.stubGlobal("fetch", fetchMock);

    const summary = await runScheduledRefresh(
      { ...envBase, SCRAPER: scraper } as Env,
      new Date("2026-08-19T03:00:00.000Z"),
    );

    expect(summary).toEqual({
      scheduledAt: "2026-08-19T03:00:00.000Z",
      productCount: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(scraper.fetch).toHaveBeenCalledWith(
      "https://mantis-scraper/api/extract",
      expect.objectContaining({
        body: JSON.stringify({ url: "https://example.com/item", selectors }),
      }),
    );
    const [, scanRequest] = fetchMock.mock.calls[5] as [string, RequestInit];
    expect(JSON.parse(String(scanRequest.body))).toMatchObject({
      trigger: "scheduled",
      actor: "scheduler",
      extraction_method: "deterministic",
    });
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "scheduled_refresh",
        status: "completed",
        succeeded: 1,
      }),
    );
  });

  it("enqueues one refresh message per stored product", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "11111111-1111-4111-8111-111111111111",
              source_url: "https://example.com/item",
              site: "example.com",
              status: "ready",
              title: "Example item",
              price: 100,
              currency: "INR",
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
    const sendBatch = vi.fn().mockResolvedValue({});
    const queue = { sendBatch } as unknown as Queue<RefreshQueueMessage>;

    const summary = await enqueueScheduledRefresh(
      { ...envBase, REFRESH_QUEUE: queue } as Env,
      new Date("2026-08-19T03:00:00.000Z"),
    );

    expect(summary).toEqual({
      scheduledAt: "2026-08-19T03:00:00.000Z",
      productCount: 1,
      succeeded: 0,
      failed: 0,
    });
    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          sourceUrl: "https://example.com/item",
          scheduledAt: "2026-08-19T03:00:00.000Z",
        },
      },
    ]);
  });

  it("processes queued refreshes one at a time and acknowledges them", async () => {
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([configuration]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const scraper = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 })),
    };
    const ack = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await worker.queue(
      {
        queue: "mantis-refresh-preview",
        metadata: {} as MessageBatchMetadata,
        messages: [
          {
            id: "message-1",
            timestamp: new Date("2026-08-19T03:00:00.000Z"),
            attempts: 1,
            body: {
              sourceUrl: extraction.source_url,
              scheduledAt: "2026-08-19T03:00:00.000Z",
            },
            ack,
            retry: vi.fn(),
          },
        ],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      },
      { ...envBase, SCRAPER: scraper } as Env,
    );

    expect(scraper.fetch).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "scheduled_product_refresh",
        status: "ready",
        source_url: extraction.source_url,
      }),
    );
  });
});
