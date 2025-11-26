"use client"

import { useState } from "react"
import { ChevronLeft, Radar, History, Settings } from "lucide-react"
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
        isCollapsed ? "w-20" : "w-48",
      )}
    >
      {/* Collapse Button */}
      <div className="flex justify-end p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", isCollapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 px-3 space-y-2">
        {menuItems.map((item) => (
          <Button
            key={item.label}
            variant={item.tab === activeTab ? "default" : "ghost"}
            className={cn(
              "w-full justify-start",
              item.tab === activeTab && "bg-emerald-600 hover:bg-emerald-700 text-white",
            )}
            onClick={() => onTabChange?.(item.tab)}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span className="ml-3">{item.label}</span>}
          </Button>
        ))}
      </nav>
    </aside>
  )
}
