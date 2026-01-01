import { useCallback, useEffect, useState } from "react"
import { Copy, LogOut, Minus, Settings, Square, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isElectron } from "@/lib/backend"
import { useAuth } from "@/contexts/AuthContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface NavbarProps {
  onSettingsClick?: () => void
  isSettingsActive?: boolean
}

export function Navbar({ onSettingsClick, isSettingsActive }: NavbarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const isElectronEnv = isElectron()
  const { user, logout } = useAuth()

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (user?.name) {
      return user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    if (user?.email) {
      return user.email[0].toUpperCase()
    }
    return "U"
  }

  useEffect(() => {
    if (!isElectronEnv || !window.electronAPI) {
      return
    }

    let unsubscribe: (() => void) | undefined

    void (async () => {
      try {
        const state = (await window.electronAPI!.getWindowState?.()) ?? { maximized: false }
        setIsMaximized(Boolean(state.maximized))
      } catch {
        // ignore – likely running in the browser
      }

      unsubscribe = window.electronAPI!.onWindowStateChange?.((state) => {
        setIsMaximized(Boolean(state.maximized))
      })
    })()

    return () => {
      unsubscribe?.()
    }
  }, [isElectronEnv])

  const handleMinimize = useCallback(() => {
    void window.electronAPI?.minimizeWindow?.()
  }, [])

  const handleToggleMaximize = useCallback(() => {
    void window.electronAPI?.toggleMaximizeWindow?.()
  }, [])

  const handleClose = useCallback(() => {
    void window.electronAPI?.closeWindow?.()
  }, [])

  const captionButtonBase =
    "app-no-drag relative flex h-8 w-10 items-center justify-center text-sm text-muted-foreground/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"

  return (
    <nav className="app-drag select-none border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-3 app-no-drag">
          <div className="text-lg font-mono font-bold text-emerald-400">{">"} mantis_</div>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="app-no-drag relative h-8 w-8 rounded-full"
                aria-label="User menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1">
                  {user?.name && (
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                  )}
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSettingsClick}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isElectronEnv && (
            <div className="ml-1 flex h-full">
              <button
                type="button"
                className={cn(
                  captionButtonBase,
                  "rounded-l-md hover:bg-white/10 focus-visible:ring-offset-[-2px]",
                )}
                onClick={handleMinimize}
                aria-label="Minimize window"
              >
                <Minus className="h-3 w-3" />
              </button>
              <button
                type="button"
                className={cn(
                  captionButtonBase,
                  "hover:bg-white/10 border-l border-border/30",
                )}
                onClick={handleToggleMaximize}
                aria-label={isMaximized ? "Restore window" : "Maximize window"}
              >
                {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
              </button>
              <button
                type="button"
                className={cn(
                  captionButtonBase,
                  "rounded-r-md border-l border-border/30 text-red-100 hover:bg-red-600 hover:text-white focus-visible:ring-red-500/70",
                )}
                onClick={handleClose}
                aria-label="Close window"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
