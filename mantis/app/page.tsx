"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { KeyRound, Loader2, RefreshCw, Search, ShieldCheck, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Navbar } from "@/components/navbar"
import { Sidebar } from "@/components/sidebar"
import { ProductCard } from "@/components/product-card"
import { isElectron, resolveBackendBaseUrl } from "@/lib/backend"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type StockStatus = "In Stock" | "Out of Stock" | "Unknown"
type PriceTrend = "up" | "down" | "flat" | "neutral"
type ActiveTab = "tracker" | "history" | "settings"

interface TrackedProduct {
  id: number
  url: string
  title: string
  price: number
  currency: string
  stockStatus: StockStatus
  website?: string
  lastChecked: string
  previousPrice?: number | null
  previousCurrency?: string | null
  lowestPrice?: number | null
  lowestCurrency?: string | null
  lowestTimestamp?: string | null
  isRefreshing?: boolean
}

type RenderedProduct = TrackedProduct & {
  priceLabel: string
  previousPriceLabel: string | null
  differenceLabel: string | null
  trend: PriceTrend
  isLowest: boolean
  lowestPriceLabel: string | null
}

interface ProductExtractionResponse {
  page_content: string
  structured?: {
    title: string
    price: number
    currency: string
    stock_status: StockStatus
    website?: string
  }
  product?: ApiTrackedProduct
}

interface ApiTrackedProduct {
  id: number
  url: string
  title: string | null
  price: number
  currency: string
  stock_status: StockStatus
  website?: string | null
  last_checked: string
  previous_price?: number | null
  previous_currency?: string | null
  lowest_price?: number | null
  lowest_currency?: string | null
  lowest_timestamp?: string | null
}

interface ApiKeyStatus {
  configured: boolean
  last4: string | null
}

const FALLBACK_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"

export default function Home() {
  const [products, setProducts] = useState<TrackedProduct[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)
  const [isResolvingBase, setIsResolvingBase] = useState(true)

  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null)
  const [isLoadingKeyStatus, setIsLoadingKeyStatus] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<RenderedProduct | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>("tracker")

  const isElectronEnv = isElectron()

  const formatPrice = useCallback((price: number, currency: string) => {
    if (!Number.isFinite(price)) {
      return currency ? `${currency} ${price}` : price.toString()
    }

    const trimmedCurrency = currency?.trim()
    const upperCurrency = trimmedCurrency?.toUpperCase()

    if (upperCurrency && /^[A-Z]{3}$/.test(upperCurrency)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: upperCurrency,
        }).format(price)
      } catch {
        // fall back to manual formatting if the code is not recognized
      }
    }

    const formattedNumber = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price)

    return trimmedCurrency ? `${trimmedCurrency} ${formattedNumber}` : formattedNumber
  }, [])

  const hydrateProduct = useCallback(
    (product: ApiTrackedProduct): TrackedProduct => ({
      id: product.id,
      url: product.url,
      title: product.title ?? "Untitled product",
      price: product.price,
      currency: product.currency,
      stockStatus: product.stock_status ?? "Unknown",
      website: product.website ?? undefined,
      lastChecked: product.last_checked,
      previousPrice: product.previous_price ?? null,
      previousCurrency: product.previous_currency ?? null,
      lowestPrice: product.lowest_price ?? null,
      lowestCurrency: product.lowest_currency ?? null,
      lowestTimestamp: product.lowest_timestamp ?? null,
      isRefreshing: false,
    }),
    [],
  )

  const loadProducts = useCallback(async () => {
    if (!apiBaseUrl) {
      return
    }
    try {
      const response = await fetch(`${apiBaseUrl}/products`)
      if (!response.ok) {
        throw new Error("Failed to load products.")
      }
      const data = (await response.json()) as ApiTrackedProduct[]
      setProducts(data.map(hydrateProduct))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load products."
      setErrorMessage(message)
    }
  }, [apiBaseUrl, hydrateProduct])

  useEffect(() => {
    let cancelled = false

    async function resolveBase() {
      setIsResolvingBase(true)
      try {
        const base = await resolveBackendBaseUrl()
        if (!cancelled) {
          setApiBaseUrl(base)
        }
      } catch (error) {
        console.error("Failed to resolve backend base URL", error)
        if (!cancelled) {
          setApiBaseUrl(FALLBACK_BASE_URL)
        }
      } finally {
        if (!cancelled) {
          setIsResolvingBase(false)
        }
      }
    }

    void resolveBase()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!apiBaseUrl) {
      return
    }
    void loadProducts()
  }, [apiBaseUrl, loadProducts])

  const refreshApiKeyStatus = useCallback(async () => {
    if (!isElectron()) {
      setApiKeyStatus(null)
      return
    }
    setIsLoadingKeyStatus(true)
    try {
      const status = await window.electronAPI!.getApiKeyStatus()
      setApiKeyStatus(status)
    } catch (error) {
      console.error("Failed to load API key status:", error)
      setApiKeyStatus(null)
    } finally {
      setIsLoadingKeyStatus(false)
    }
  }, [])

  useEffect(() => {
    if (isElectron()) {
      void refreshApiKeyStatus()
    }
  }, [refreshApiKeyStatus])

  useEffect(() => {
    if (activeTab === "settings" && isElectronEnv) {
      void refreshApiKeyStatus()
    }
  }, [activeTab, isElectronEnv, refreshApiKeyStatus])

  const handleTrack = useCallback(
    async (urlParam?: string) => {
      const url = (urlParam ?? inputValue).trim()
      const isManual = !urlParam
      if (!url || (isManual && isScanning) || !apiBaseUrl) {
        return
      }

      if (isManual) {
        setIsScanning(true)
      }
      setErrorMessage(null)

      try {
        const response = await fetch(`${apiBaseUrl}/products/fetch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        })

        if (!response.ok) {
          let detail = "Failed to fetch product information."
          try {
            const errorPayload = (await response.json()) as { detail?: string }
            if (errorPayload.detail) {
              detail = errorPayload.detail
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(detail)
        }

        const payload = (await response.json()) as ProductExtractionResponse
        if (!payload.structured) {
          throw new Error("The agent did not return structured data for this URL.")
        }

        if (payload.product) {
          const hydrated = hydrateProduct(payload.product)
          setProducts((prev) => {
            const withoutExisting = prev.filter((item) => item.id !== hydrated.id)
            return [hydrated, ...withoutExisting]
          })
        } else {
          const structured = payload.structured
          if (structured) {
            const hydrated: TrackedProduct = {
              id: Date.now(),
              url,
              title: structured.title,
              price: structured.price,
              currency: structured.currency,
              stockStatus: structured.stock_status ?? "Unknown",
              website: structured.website ?? undefined,
              lastChecked: new Date().toISOString(),
              previousPrice: null,
              previousCurrency: null,
              lowestPrice: null,
              lowestCurrency: null,
              lowestTimestamp: null,
              isRefreshing: false,
            }
            setProducts((prev) => {
              const withoutExisting = prev.filter((item) => item.url !== hydrated.url)
              return [hydrated, ...withoutExisting]
            })
          }
        }
        if (!urlParam) {
          setInputValue("")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong."
        setErrorMessage(message)
      } finally {
        if (isManual) {
          setIsScanning(false)
        }
      }
    },
    [apiBaseUrl, hydrateProduct, inputValue, isScanning],
  )

  const handleRefresh = useCallback(
    async (productId: number) => {
      const product = products.find((item) => item.id === productId)
      if (!product) {
        return
      }
      setProducts((prev) =>
        prev.map((item) => (item.id === productId ? { ...item, isRefreshing: true } : item)),
      )
      try {
        await handleTrack(product.url)
      } finally {
        setProducts((prev) =>
          prev.map((item) => (item.id === productId ? { ...item, isRefreshing: false } : item)),
        )
      }
    },
    [handleTrack, products],
  )

  const performDelete = useCallback(
    async (product: RenderedProduct | null) => {
      if (!apiBaseUrl || !product) {
        return
      }

      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.add(product.id)
        return next
      })
      setErrorMessage(null)

      try {
        const response = await fetch(`${apiBaseUrl}/products/${product.id}`, {
          method: "DELETE",
        })
        if (!response.ok) {
          let detail = "Failed to delete product."
          try {
            const payload = (await response.json()) as { detail?: string }
            if (payload.detail) {
              detail = payload.detail
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(detail)
        }
        setProducts((prev) => prev.filter((item) => item.id !== product.id))
        setPendingDelete(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete product."
        setErrorMessage(message)
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(product.id)
          return next
        })
      }
    },
    [apiBaseUrl],
  )

  const renderedProducts = useMemo<RenderedProduct[]>(() => {
    const epsilon = 1e-9
    return products.map((product) => {
      const priceLabel = formatPrice(product.price, product.currency)
      const previousPrice = product.previousPrice ?? null
      const previousPriceLabel =
        previousPrice != null
          ? formatPrice(previousPrice, product.previousCurrency ?? product.currency)
          : null
      const diff = previousPrice != null ? product.price - previousPrice : null
      const trend: PriceTrend =
        diff == null || Math.abs(diff) < epsilon ? "neutral" : diff < 0 ? "down" : diff > 0 ? "up" : "flat"
      const differenceLabel =
        diff == null || Math.abs(diff) < epsilon
          ? null
          : `${diff > 0 ? "+" : "-"}${formatPrice(Math.abs(diff), product.currency)}`
      let isLowest = false
      if (product.previousPrice != null && product.lowestPrice != null && product.lowestTimestamp && product.lastChecked) {
        const lowestTimestamp = Date.parse(product.lowestTimestamp)
        const latestTimestamp = Date.parse(product.lastChecked)
        if (!Number.isNaN(lowestTimestamp) && !Number.isNaN(latestTimestamp)) {
          isLowest = Math.abs(latestTimestamp - lowestTimestamp) < 1000
        }
      }
      const lowestPriceLabel =
        product.lowestPrice != null
          ? formatPrice(product.lowestPrice, product.lowestCurrency ?? product.currency)
          : null

      return {
        ...product,
        priceLabel,
        previousPriceLabel,
        differenceLabel,
        trend,
        isLowest,
        lowestPriceLabel,
      }
    })
  }, [products, formatPrice])

  const baseUnavailable = isResolvingBase || !apiBaseUrl

  const handleSaveApiKey = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!isElectronEnv || !apiKeyInput.trim()) {
        return
      }

      setIsSavingApiKey(true)
      setErrorMessage(null)
      try {
        await window.electronAPI!.saveApiKey(apiKeyInput.trim())
        setApiKeyInput("")
        await refreshApiKeyStatus()
        setIsResolvingBase(true)
        const base = await resolveBackendBaseUrl()
        setApiBaseUrl(base)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save API key."
        setErrorMessage(message)
        console.error("Failed to save API key:", error)
      } finally {
        setIsSavingApiKey(false)
        setIsResolvingBase(false)
      }
    },
    [apiKeyInput, isElectronEnv, refreshApiKeyStatus],
  )

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden">
      <Navbar
        onSettingsClick={() => setActiveTab("settings")}
        isSettingsActive={activeTab === "settings"}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0 overflow-y-auto">
            <div className="container mx-auto px-6 py-12 space-y-12">
            {activeTab === "tracker" && (
              <>
                {baseUnavailable && (
                  <div className="rounded-lg border border-border/50 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Connecting to backend…
                  </div>
                )}

                <section className="max-w-2xl mx-auto space-y-6">
                  <header className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-2 text-center sm:text-left">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Track Product Prices</h1>
                        <p className="text-muted-foreground">
                          Paste a product URL and let the agent extract price, availability, and metadata.
                        </p>
                      </div>
                      {isElectronEnv && (
                        <div className="flex items-center justify-center sm:justify-end">
                          {isLoadingKeyStatus ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading key status" />
                          ) : (
                            <KeyRound
                              className={`h-5 w-5 ${apiKeyStatus?.configured ? "text-emerald-400" : "text-red-400"}`}
                              aria-label={apiKeyStatus?.configured ? "API key configured" : "API key missing"}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </header>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      placeholder="Paste Product URL..."
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && void handleTrack()}
                      className="bg-card/50 border-border/50 placeholder:text-muted-foreground/50"
                      disabled={isScanning || baseUnavailable}
                    />
                    <Button
                      onClick={() => void handleTrack()}
                      disabled={isScanning || !inputValue.trim() || baseUnavailable}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Prowling…
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Track
                        </>
                      )}
                    </Button>
                  </div>

                  {isScanning && (
                    <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-300">
                      Agent prowling… give it a moment while we render the page and extract structured data.
                    </div>
                  )}

                  {errorMessage && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {errorMessage}
                    </div>
                  )}
                </section>

                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">Tracked Products</h2>
                    <span className="text-sm text-muted-foreground">{renderedProducts.length} items</span>
                  </div>

                  {renderedProducts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-12 text-center text-sm text-muted-foreground">
                      Nothing tracked yet. Add a product URL above to see it appear here.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                      {renderedProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          title={product.title}
                          priceLabel={product.priceLabel}
                          stockStatus={product.stockStatus}
                          website={product.website}
                          url={product.url}
                          lastChecked={product.lastChecked}
                          previousPriceLabel={product.previousPriceLabel}
                          differenceLabel={product.differenceLabel}
                          trend={product.trend}
                          isLowest={product.isLowest}
                          lowestPriceLabel={product.lowestPriceLabel}
                          onRefresh={() => void handleRefresh(product.id)}
                          isRefreshing={product.isRefreshing ?? false}
                          onDelete={() => setPendingDelete(product)}
                          isDeleting={deletingIds.has(product.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {activeTab === "settings" && (
              <section className="max-w-2xl mx-auto space-y-6">
                <header className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
                  <p className="text-muted-foreground">Manage your local configuration for the Mantis agent.</p>
                </header>

                {isElectronEnv ? (
                  <Card className="border-border/50 bg-card/60 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-foreground">Google API Key</h2>
                      {isLoadingKeyStatus ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : apiKeyStatus?.configured ? (
                        <span className="flex items-center gap-2 text-sm text-emerald-300">
                          <ShieldCheck className="h-4 w-4" />
                          Configured (…{apiKeyStatus.last4 ?? "****"})
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-sm text-red-300">
                          <ShieldX className="h-4 w-4" />
                          Missing key
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Enter your Google API key. Saving will restart the backend so the new key takes effect.{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 underline-offset-4 hover:underline"
                      >
                        Get an API key from Google AI Studio.
                      </a>
                    </p>

                    <form className="space-y-3" onSubmit={handleSaveApiKey}>
                      <Input
                        type="password"
                        placeholder="Enter your Google API key"
                        value={apiKeyInput}
                        onChange={(event) => setApiKeyInput(event.target.value)}
                      />
                      <div className="flex items-center gap-3">
                        <Button
                          type="submit"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={!apiKeyInput.trim() || isSavingApiKey}
                        >
                          {isSavingApiKey ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            "Save Key"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border/60 text-muted-foreground hover:text-foreground"
                          onClick={() => void refreshApiKeyStatus()}
                          disabled={isLoadingKeyStatus}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Check Status
                        </Button>
                      </div>
                    </form>
                  </Card>
                ) : (
                  <Card className="border-border/50 bg-card/60 p-6 space-y-3 text-center text-sm text-muted-foreground">
                    <p>Settings are available when you run Mantis through the desktop bundle.</p>
                    <p>Launch the Electron app to link your Google API key and manage local preferences.</p>
                  </Card>
                )}
              </section>
            )}

            {activeTab === "history" && (
              <section className="max-w-2xl mx-auto space-y-3 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
                <p className="text-muted-foreground">
                  Product history analytics are coming soon. Stay tuned for timeline insights and export options.
                </p>
              </section>
            )}
            </div>
          </div>
        </main>
      </div>
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove product from tracker?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Deleting "${pendingDelete.title}" erases its stored price history. This action cannot be undone.`
                : "Deleting this product erases its stored price history. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-emerald-600/90 text-white hover:bg-emerald-500"
              onClick={() => setPendingDelete(null)}
              disabled={pendingDelete ? deletingIds.has(pendingDelete.id) : false}
            >
              Keep Tracking
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void performDelete(pendingDelete)}
              disabled={pendingDelete ? deletingIds.has(pendingDelete.id) : false}
            >
              {pendingDelete && deletingIds.has(pendingDelete.id) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                "Delete Product"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
