import type { ProductRecord } from "../domain/product";

type ProductCardProps = {
  product: ProductRecord;
  isDeleting: boolean;
  onDelete: (product: ProductRecord) => void;
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

export function ProductCard({ product, isDeleting, onDelete }: ProductCardProps) {
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
        {product.status === "ready" && (
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
          <a href={product.sourceUrl} target="_blank" rel="noreferrer">
            {product.sourceUrl}
          </a>
          <button
            className="product-card__delete"
            type="button"
            disabled={isDeleting || product.status === "queued"}
            onClick={() => onDelete(product)}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
        <p className="product-card__meta">
          Added {new Date(product.addedAt).toLocaleString()}
        </p>
      </div>
    </article>
  );
}
