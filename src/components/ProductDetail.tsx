import { useState } from "react";

import {
  ProductScanSchema,
  type ProductRecord,
  type ProductScan,
} from "../domain/product";
import { loadProductScanCache, saveProductScanCache } from "../domain/scan-store";

type ProductDetailProps = {
  product: ProductRecord | undefined;
  onBack: () => void;
};

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null || currency === null) return "Unavailable";

  try {
    return `${new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price)} (${currency})`;
  } catch {
    return `${price} ${currency}`;
  }
}

function formatScanMethod(scan: ProductScan): string {
  return scan.method === "deterministic" ? "Stored configuration" : "LLM discovery";
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function ProductDetail({ product, onBack }: ProductDetailProps) {
  const cachedHistory = product
    ? loadProductScanCache(browserStorage(), product.id)
    : undefined;
  const [scans, setScans] = useState<ProductScan[] | undefined>(cachedHistory?.scans);
  const [cachedAt, setCachedAt] = useState<number | undefined>(cachedHistory?.cachedAt);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function loadHistory() {
    if (!product) return;

    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/scans`,
        { headers: { Accept: "application/json" } },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String(payload.error)
            : "Refresh history could not be loaded.";
        throw new Error(message);
      }

      const nextScans = ProductScanSchema.array().parse(payload);
      setScans(nextScans);
      setCachedAt(Date.now());
      saveProductScanCache(browserStorage(), product.id, nextScans);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Refresh history could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (!product) {
    return (
      <section className="product-detail product-detail--empty">
        <button className="product-detail__back" type="button" onClick={onBack}>
          ← Back to products
        </button>
        <div className="empty-state">
          <strong>Product not found.</strong>
          <span>The product is no longer available in the current collection.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="product-detail" aria-labelledby="product-detail-title">
      <button className="product-detail__back" type="button" onClick={onBack}>
        ← Back to products
      </button>

      <div className="product-detail__summary">
        <div className="product-detail__mark" aria-hidden="true">
          {product.site.slice(0, 1).toUpperCase()}
        </div>
        <div className="product-detail__identity">
          <div className="product-card__header">
            <p className="eyebrow">{product.site}</p>
            <span className={`status status--${product.status}`}>{product.status}</span>
          </div>
          <h1 id="product-detail-title">{product.title ?? "Product waiting for extraction"}</h1>
          <a href={product.sourceUrl} target="_blank" rel="noreferrer">
            {product.sourceUrl}
          </a>
        </div>
        <div className="product-detail__price">
          <span className="eyebrow">Current price</span>
          <strong>{formatPrice(product.price, product.currency)}</strong>
        </div>
      </div>

      <div className="product-detail__timing">
        <span>
          Last extracted {product.lastExtractedAt ? formatTimestamp(product.lastExtractedAt) : "Never"}
        </span>
        <span>
          Latest attempt {product.lastAttemptedAt ? formatTimestamp(product.lastAttemptedAt) : "Not recorded"}
        </span>
      </div>

      {product.status === "failed" && (
        <div className="product-detail__error">{product.extractionError ?? "Extraction failed."}</div>
      )}

      <div className="product-detail__section-heading">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2>Refresh history</h2>
          <p>
            {cachedAt
              ? `Cached ${new Date(cachedAt).toLocaleString()}. Refresh when you want the latest data.`
              : "History is only requested when you choose to load it."}
          </p>
        </div>
        <button
          className="product-detail__history-button"
          type="button"
          disabled={isLoading}
          onClick={() => void loadHistory()}
        >
          {isLoading ? "Loading history..." : scans ? "Refresh history" : "Load refresh history"}
        </button>
      </div>

      {error && (
        <p className="product-detail__error" aria-live="polite">
          {error}
        </p>
      )}

      {scans === undefined && !error && (
        <div className="product-detail__history-placeholder">
          <strong>History not loaded.</strong>
          <span>Use the button when you want to inspect previous extraction runs.</span>
        </div>
      )}

      {scans?.length === 0 && (
        <div className="product-detail__history-placeholder">
          <strong>No refreshes recorded yet.</strong>
          <span>The first scan will appear here after it has been saved.</span>
        </div>
      )}

      {scans && scans.length > 0 && (
        <div className="product-detail__history" aria-live="polite">
          {scans.map((scan) => (
            <article className="scan-row" key={scan.id}>
              <div className="scan-row__status">
                <span className={`status status--${scan.status}`}>{scan.status}</span>
                <strong>{formatScanMethod(scan)}</strong>
              </div>
              <dl className="scan-row__details">
                <div>
                  <dt>Scanned</dt>
                  <dd>{new Date(scan.scannedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>{scan.actor}</dd>
                </div>
                <div>
                  <dt>Trigger</dt>
                  <dd>{scan.trigger}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{scan.durationMs} ms</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>{formatPrice(scan.price, scan.currency)}</dd>
                </div>
                <div>
                  <dt>Configuration</dt>
                  <dd>{scan.scraperConfigurationId ?? "None"}</dd>
                </div>
              </dl>
              {scan.title && <p className="scan-row__title">{scan.title}</p>}
              {scan.model && <p className="scan-row__meta">Model: {scan.model}</p>}
              {scan.extractionError && (
                <p className="scan-row__error">{scan.extractionError}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
