import { FormEvent, useEffect, useRef, useState } from "react";

import { ProductCard } from "./components/ProductCard";
import {
  addProduct,
  ExtractionResultSchema,
  ProductRecordSchema,
  markProductFailed,
  markProductQueued,
  markProductReady,
  type ProductRecord,
} from "./domain/product";
import {
  isProductCacheFresh,
  loadProducts,
  markProductsCached,
  saveProducts,
} from "./domain/product-store";

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export default function App() {
  const [products, setProducts] = useState<ProductRecord[]>(() =>
    loadProducts(browserStorage()),
  );
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | undefined>();
  const [retryingProductId, setRetryingProductId] = useState<string | undefined>();
  const hasLocalChanges = useRef(false);

  useEffect(() => {
    saveProducts(browserStorage(), products);
  }, [products]);

  useEffect(() => {
    const storage = browserStorage();
    if (isProductCacheFresh(storage)) return;

    let cancelled = false;

    async function syncProducts() {
      try {
        const response = await fetch("/api/products", {
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" && payload !== null && "error" in payload
              ? String(payload.error)
              : "Product sync failed.";
          throw new Error(message);
        }

        const syncedProducts = ProductRecordSchema.array().parse(payload);
        if (cancelled || hasLocalChanges.current) return;

        setProducts(syncedProducts);
        saveProducts(storage, syncedProducts);
        markProductsCached(storage);
      } catch {
      }
    }

    void syncProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  async function extractProduct(product: ProductRecord, trigger: "add" | "retry") {
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.sourceUrl, trigger }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String(payload.error)
            : "Extraction failed.";
        throw new Error(message);
      }

      const extraction = ExtractionResultSchema.parse(payload);
      setProducts((current) => markProductReady(current, product.id, extraction));
      setFeedback("Product extracted and saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed.";
      setProducts((current) => markProductFailed(current, product.id, message));
      setFeedback(`Extraction failed: ${message}`);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let result;
    try {
      result = addProduct(products, url);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Enter a valid product link.");
      return;
    }

    if (!result.added) {
      setFeedback("That product is already here.");
      return;
    }

    setProducts(result.products);
    hasLocalChanges.current = true;
    setUrl("");
    setIsSubmitting(true);
    setFeedback("Product added. Extracting product details...");

    try {
      await extractProduct(result.product, "add");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetry(product: ProductRecord) {
    if (isSubmitting) return;

    setProducts((current) => markProductQueued(current, product.id));
    hasLocalChanges.current = true;
    setRetryingProductId(product.id);
    setIsSubmitting(true);
    setFeedback("Retrying product extraction...");

    try {
      await extractProduct(product, "retry");
    } finally {
      setRetryingProductId(undefined);
      setIsSubmitting(false);
    }
  }

  async function handleDelete(product: ProductRecord) {
    if (!window.confirm("Delete this product?")) return;

    setDeletingProductId(product.id);
    try {
      const response = await fetch(
        `/api/products?source_url=${encodeURIComponent(product.sourceUrl)}`,
        { method: "DELETE" },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String(payload.error)
            : "Product deletion failed.";
        throw new Error(message);
      }

      setProducts((current) => current.filter((item) => item.id !== product.id));
      hasLocalChanges.current = true;
      setFeedback("Product deleted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Product deletion failed.");
    } finally {
      setDeletingProductId(undefined);
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
            Add a product URL now and the extractor will fill in the product details.
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
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Extracting..." : "Add product"}
            </button>
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
              <ProductCard
                key={product.id}
                product={product}
                isDeleting={deletingProductId === product.id}
                isRetrying={retryingProductId === product.id}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
