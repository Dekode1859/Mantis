"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, History, Radar, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SidebarTab = "tracker" | "history" | "settings"

interface SidebarProps {
  activeTab: SidebarTab
  onTabChange?: (tab: SidebarTab) => void
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const menuItems = [
    { icon: Radar, label: "Tracker", tab: "tracker" as const },
    { icon: History, label: "History", tab: "history" as const },
    { icon: Settings, label: "Settings", tab: "settings" as const },
  ]

  return (
    <aside
      className={cn(
        "border-r border-border/50 bg-background/95 backdrop-blur transition-all duration-300 flex flex-col",
        isCollapsed ? "w-18" : "w-56",
      )}
    >
      {/* Collapse Button */}
      <div className={cn("flex", isCollapsed ? "justify-center px-0 py-4" : "justify-end px-5 py-4")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Menu Items */}
      <nav className={cn("flex-1 space-y-2", isCollapsed ? "px-2" : "px-4")}>
        {menuItems.map((item) => (
          <Button
            key={item.label}
            variant={item.tab === activeTab ? "default" : "ghost"}
            className={cn(
              "w-full items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              isCollapsed ? "justify-center" : "justify-start gap-3",
              item.tab === activeTab
                ? "bg-emerald-600/90 text-white shadow-sm hover:bg-emerald-600"
                : "text-muted-foreground hover:bg-white/5",
            )}
            onClick={() => onTabChange?.(item.tab)}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span>{item.label}</span>}
          </Button>
        ))}
      </nav>
      {/* {!isCollapsed && (
        <div className="px-4 py-6 text-xs text-muted-foreground/70">
          <p className="leading-snug">Tip: collapse the sidebar when you need extra space for product details.</p>
        </div>
      )} */}
    </aside>
  )
}
