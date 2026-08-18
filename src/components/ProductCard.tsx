import type { ProductRecord } from "../domain/product";

type ProductCardProps = {
  product: ProductRecord;
};

export function ProductCard({ product }: ProductCardProps) {
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
              <dd>{product.price ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Seller</dt>
              <dd>{product.seller ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>ASIN</dt>
              <dd>{product.asin ?? "Unavailable"}</dd>
            </div>
          </dl>
        )}
        {product.status === "failed" && (
          <p className="product-card__error">{product.extractionError ?? "Extraction failed."}</p>
        )}
        <a href={product.sourceUrl} target="_blank" rel="noreferrer">
          {product.sourceUrl}
        </a>
        <p className="product-card__meta">
          Added {new Date(product.addedAt).toLocaleString()}
        </p>
      </div>
    </article>
  );
}
