import type { ProductRecord } from "../domain/product";

type ProductCardProps = {
  product: ProductRecord;
  isDeleting: boolean;
  isRetrying: boolean;
  onDelete: (product: ProductRecord) => void;
  onRetry: (product: ProductRecord) => void;
  onView: (product: ProductRecord) => void;
};

function formatPrice(product: ProductRecord): string {
  if (product.price === null || product.currency === null) return "Unavailable";

  try {
    const formatted = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: product.currency,
      maximumFractionDigits: 2,
    }).format(product.price);
    return `${formatted} (${product.currency})`;
  } catch {
    return `${product.price} ${product.currency}`;
  }
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function ProductCard({
  product,
  isDeleting,
  isRetrying,
  onDelete,
  onRetry,
  onView,
}: ProductCardProps) {
  return (
    <article className="product-card">
      <div className="product-card__placeholder" aria-hidden="true">
        <span>{product.site.slice(0, 1).toUpperCase()}</span>
      </div>
      <div className="product-card__body">
        <div className="product-card__header">
          <span className="eyebrow">{product.site}</span>
          <span className={`status status--${product.status}`}>{product.status}</span>
        </div>
        <h2>{product.title ?? "Product waiting for extraction"}</h2>
        {product.price !== null && product.currency !== null && (
          <dl className="product-card__details">
            <div>
              <dt>Price</dt>
              <dd>{formatPrice(product)}</dd>
            </div>
          </dl>
        )}
        {product.status === "failed" && (
          <p className="product-card__error">{product.extractionError ?? "Extraction failed."}</p>
        )}
        <div className="product-card__actions">
          <button
            className="product-card__view"
            type="button"
            onClick={() => onView(product)}
          >
            View details
          </button>
          <a href={product.sourceUrl} target="_blank" rel="noreferrer">
            {product.sourceUrl}
          </a>
          {product.status === "failed" && (
            <button
              className="product-card__retry"
              type="button"
              disabled={isRetrying || isDeleting}
              onClick={() => onRetry(product)}
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </button>
          )}
          <button
            className="product-card__delete"
            type="button"
            disabled={isDeleting || isRetrying || product.status === "queued"}
            onClick={() => onDelete(product)}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
        <p className="product-card__meta">
          Added {formatTimestamp(product.addedAt)}
        </p>
        {product.lastExtractedAt && (
          <p className="product-card__meta">
            Last extracted {formatTimestamp(product.lastExtractedAt)}
          </p>
        )}
        {product.status === "failed" && product.lastAttemptedAt && (
          <p className="product-card__meta">
            Latest attempt failed {formatTimestamp(product.lastAttemptedAt)}
          </p>
        )}
      </div>
    </article>
  );
}
