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
