import { FormEvent, useEffect, useState } from "react";

import { ProductCard } from "./components/ProductCard";
import { addProduct, type ProductRecord } from "./domain/product";
import { loadProducts, saveProducts } from "./domain/product-store";

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export default function App() {
  const [products, setProducts] = useState<ProductRecord[]>(() =>
    loadProducts(browserStorage()),
  );
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<string | undefined>();

  useEffect(() => {
    saveProducts(browserStorage(), products);
  }, [products]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const result = addProduct(products, url);
      setProducts(result.products);
      setUrl("");
      setFeedback(
        result.added ? "Product added and waiting for extraction." : "That product is already here.",
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The product link could not be added.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          Mantis
        </a>
        <span className="topbar__note">Product collection</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Collection</p>
          <h1>Keep product links in one place.</h1>
          <p className="hero__copy">
            Add a product URL now. Extraction will fill in the product details when that pipeline is connected.
          </p>
        </div>

        <form className="add-form" onSubmit={handleSubmit}>
          <label htmlFor="product-url">Product link</label>
          <div className="add-form__row">
            <input
              id="product-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.amazon.in/dp/..."
              autoComplete="url"
            />
            <button type="submit">Add product</button>
          </div>
          <p className="form-feedback" aria-live="polite">
            {feedback ?? "Use a complete HTTP or HTTPS URL."}
          </p>
        </form>
      </section>

      <section className="collection" aria-labelledby="collection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved links</p>
            <h2 id="collection-title">Products</h2>
          </div>
          <span className="count">{products.length}</span>
        </div>

        {products.length === 0 ? (
          <div className="empty-state">
            <strong>No products yet.</strong>
            <span>Add a product link above to create the first card.</span>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
