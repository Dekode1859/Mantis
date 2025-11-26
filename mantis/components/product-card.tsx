import type { ComponentType } from "react"
import Link from "next/link"
import { AlertCircle, Check, HelpCircle, Link2, Loader2, RefreshCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StockStatus = "In Stock" | "Out of Stock" | "Unknown"
type PriceTrend = "up" | "down" | "flat" | "neutral"

interface ProductCardProps {
  title: string
  priceLabel: string
  stockStatus: StockStatus
  website?: string
  url: string
  lastChecked: string
  previousPriceLabel?: string | null
  differenceLabel?: string | null
  trend: PriceTrend
  isLowest: boolean
  lowestPriceLabel?: string | null
  onRefresh?: () => void
  isRefreshing?: boolean
}

const STATUS_STYLES: Record<StockStatus, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  "In Stock": {
    badge: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30",
    icon: Check,
  },
  "Out of Stock": {
    badge: "bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/30",
    icon: AlertCircle,
  },
  Unknown: {
    badge: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/60",
    icon: HelpCircle,
  },
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function ProductCard({
  title,
  priceLabel,
  stockStatus,
  website,
  url,
  lastChecked,
  previousPriceLabel,
  differenceLabel,
  trend,
  isLowest,
  lowestPriceLabel,
  onRefresh,
  isRefreshing = false,
}: ProductCardProps) {
  const status = STATUS_STYLES[stockStatus] ?? STATUS_STYLES.Unknown
  const StatusIcon = status.icon
  const formattedDate = (() => {
    const parsed = new Date(lastChecked)
    return Number.isNaN(parsed.getTime()) ? lastChecked : dateFormatter.format(parsed)
  })()
  let domain = website?.trim()
  if (!domain) {
    try {
      domain = new URL(url).hostname
    } catch {
      domain = undefined
    }
  }

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 hover:bg-card transition-colors hover:border-border/80 h-full flex flex-col">
      <div className="p-5 space-y-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="font-semibold text-base text-foreground leading-tight line-clamp-2">{title}</h3>
            {domain && (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-xs text-muted-foreground gap-1 hover:text-emerald-300 transition-colors"
              >
                <Link2 className="h-3 w-3" />
                <span className="truncate">{domain}</span>
              </Link>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {isLowest && (
              <Badge className="bg-emerald-500/15 border-emerald-500/40 text-emerald-300">Lowest price</Badge>
            )}
            <div
              className={cn(
                "text-2xl font-bold",
                isLowest
                  ? "bg-gradient-to-br from-purple-200 via-fuchsia-400 to-purple-200 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(192,132,252,0.55)]"
                  : trend === "down"
                  ? "text-emerald-400"
                  : trend === "up"
                  ? "text-red-400"
                  : "text-foreground",
              )}
            >
              {priceLabel}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onRefresh?.()}
              disabled={isRefreshing || !onRefresh}
              className="h-8 w-8 border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <Badge className={status.badge}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {stockStatus}
            </Badge>
            <span>Updated: {formattedDate}</span>
          </div>

          {previousPriceLabel && (
            <p className="text-muted-foreground">
              Prev: {previousPriceLabel}
              {differenceLabel && (
                <span
                  className={cn(
                    "ml-2 font-medium",
                    trend === "down"
                      ? "text-emerald-400"
                      : trend === "up"
                      ? "text-red-400"
                      : "text-muted-foreground",
                  )}
                >
                  {trend === "down" ? "↓" : trend === "up" ? "↑" : "→"} {differenceLabel}
                </span>
              )}
            </p>
          )}

          {lowestPriceLabel && !isLowest && (
            <p className="text-muted-foreground">Lowest recorded: {lowestPriceLabel}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
