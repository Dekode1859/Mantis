import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NavbarProps {
  onSettingsClick?: () => void
  isSettingsActive?: boolean
}

export function Navbar({ onSettingsClick, isSettingsActive }: NavbarProps) {
  return (
    <nav className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-xl font-mono font-bold text-emerald-400">{">"} mantis_</div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={onSettingsClick}
          aria-label="Open settings"
          data-state={isSettingsActive ? "active" : "inactive"}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </nav>
  )
}
