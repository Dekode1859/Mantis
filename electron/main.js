const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require("electron")
const { spawn, spawnSync } = require("child_process")
const path = require("path")
const fs = require("fs")

let mainWindow = null
let tray = null
let backendProcess = null
let backendPort = null
let appIsQuitting = false
let portResolvers = []
let frontendBuildPromise = null

const isWindows = process.platform === "win32"
const backendBinaryName = isWindows ? "mantis-engine.exe" : "mantis-engine"
const npmCommand = isWindows ? "npm.cmd" : "npm"

const settingsPath = path.join(app.getPath("userData"), "settings.json")
let settings = {}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8")
      settings = JSON.parse(raw)
    }
  } catch (error) {
    console.error("Failed to load settings:", error)
    settings = {}
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8")
  } catch (error) {
    console.error("Failed to save settings:", error)
  }
}

loadSettings()

function log(...args) {
  console.log("[mantis-shell]", ...args)
}

function notifyPort(port) {
  backendPort = Number(port)
  if (Number.isNaN(backendPort)) {
    return
  }
  log("Backend available on port", backendPort)
  if (tray) {
    // tray.setToolTip(`Mantis Price Tracker (port ${backendPort})`)
    tray.setToolTip("Mantis")
    tray.setContextMenu(buildTrayMenu())
  }
  portResolvers.forEach((resolve) => resolve(backendPort))
  portResolvers = []
}

function waitForBackendPort() {
  if (backendPort) {
    return Promise.resolve(backendPort)
  }
  return new Promise((resolve) => {
    portResolvers.push(resolve)
  })
}

function resolveBackendCommand() {
  const resourcesBinary = path.join(process.resourcesPath, backendBinaryName)
  const distBinary = path.resolve(__dirname, "../backend/dist", backendBinaryName)

  if (fs.existsSync(resourcesBinary)) {
    return { command: resourcesBinary, args: [] }
  }

  if (fs.existsSync(distBinary)) {
    return { command: distBinary, args: [] }
  }

  const pythonCmd = isWindows ? "python" : "python3"
  const fallbackScript = path.resolve(__dirname, "../backend/run.py")
  return { command: pythonCmd, args: [fallbackScript] }
}

function resolveAppIcon() {
  if (app.isPackaged) {
    const packagedPng = path.join(process.resourcesPath, "frontend", "mantis-icon.png")
    if (fs.existsSync(packagedPng)) {
      return packagedPng
    }
    const packagedRootIco = path.join(process.resourcesPath, "icon.ico")
    if (fs.existsSync(packagedRootIco)) {
      return packagedRootIco
    }
    const packagedIco = path.join(process.resourcesPath, "frontend", "icon.ico")
    if (fs.existsSync(packagedIco)) {
      return packagedIco
    }
    const packagedFavicon = path.join(process.resourcesPath, "frontend", "favicon.ico")
    if (fs.existsSync(packagedFavicon)) {
      return packagedFavicon
    }
  } else {
    const devPng = path.resolve(__dirname, "../mantis/public/mantis-icon.png")
    if (fs.existsSync(devPng)) {
      return devPng
    }
    const devFavicon = path.resolve(__dirname, "../mantis/public/favicon.ico")
    if (fs.existsSync(devFavicon)) {
      return devFavicon
    }
  }
  return undefined
}

function getStoredApiKey() {
  return settings.apiKey ?? null
}

function findWindowsPidByPort(port) {
  if (!port) {
    return null
  }
  try {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`,
    ])
    if (result.status === 0) {
      const output = result.stdout.toString().trim()
      if (output) {
        const pid = Number.parseInt(output, 10)
        return Number.isNaN(pid) ? null : pid
      }
    }
  } catch (error) {
    console.error("Failed to resolve PID for port", port, error)
  }
  return null
}

function stopBackend(signal) {
  if (backendProcess) {
    const child = backendProcess
    const targetPid = child.pid
    const portAtStop = backendPort
    try {
      const effectiveSignal = signal ?? (process.platform === "win32" ? "SIGTERM" : "SIGINT")
      child.kill(effectiveSignal)
    } catch (error) {
      console.error("Failed to terminate backend process:", error)
    }
    if (process.platform === "win32") {
      setTimeout(() => {
        try {
          const portPid = findWindowsPidByPort(portAtStop)
          if (portPid) {
            spawn("taskkill", ["/PID", String(portPid), "/T", "/F"])
          } else if (targetPid) {
            spawn("taskkill", ["/PID", String(targetPid), "/T", "/F"])
          } else {
            spawn("taskkill", ["/IM", "mantis-engine.exe", "/T", "/F"])
          }
        } catch (error) {
          console.error("Failed to force terminate backend process", error)
        }
      }, 500)
    }
    backendProcess = null
  }
  backendPort = null
  portResolvers = []
}

async function startBackend(extraEnv = {}) {
  if (backendProcess) {
    return
  }

  const { command, args } = resolveBackendCommand()
  const effectiveArgs = [...args, "--port", "0"]
  const dbPath = path.join(app.getPath("userData"), "mantis.db")
  const env = {
    ...process.env,
    MANTIS_DB_PATH: dbPath,
    ...extraEnv,
  }

  const storedKey = getStoredApiKey()
  if (storedKey) {
    env.GOOGLE_API_KEY = storedKey
  }

  log("Starting backend:", command, effectiveArgs.join(" "))
  backendProcess = spawn(command, effectiveArgs, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  backendProcess.stdout.setEncoding("utf8")
  backendProcess.stdout.on("data", (chunk) => {
    const message = chunk.toString()
    message.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) {
        return
      }
      log("[backend]", line)
      const match = line.match(/\[mantis-engine\]\s+listening on .*:(\d+)/i)
      if (match) {
        notifyPort(match[1])
      }
    })
  })

  backendProcess.stderr.setEncoding("utf8")
  backendProcess.stderr.on("data", (chunk) => {
    const message = chunk.toString()
    message.split(/\r?\n/).forEach((line) => {
      if (line.trim()) {
        console.error("[mantis-backend-error]", line)
      }
    })
  })

  backendProcess.on("exit", (code, signal) => {
    log("Backend exited", { code, signal })
    backendProcess = null
    backendPort = null
    portResolvers = []
    if (!appIsQuitting) {
      dialog.showErrorBox(
        "Mantis backend stopped",
        `The backend process exited unexpectedly (code: ${code ?? "unknown"})`,
      )
    }
  })
}

async function refreshAllProducts() {
  try {
    const port = await waitForBackendPort()
    await fetch(`http://127.0.0.1:${port}/products/refresh`, {
      method: "POST",
    })
  } catch (error) {
    console.error("Failed to trigger refresh:", error)
    dialog.showErrorBox("Refresh failed", "Could not trigger the background refresh.")
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open Dashboard",
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    {
      label: "Refresh Now",
      enabled: Boolean(backendPort),
      click: () => {
        void refreshAllProducts()
      },
    },
    {
      label: "Restart Backend",
      enabled: Boolean(backendProcess),
      click: () => {
        void restartBackend()
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        appIsQuitting = true
        stopBackend()
        app.quit()
      },
    },
  ])
}

function createTray() {
  if (tray) {
    return
  }
  const iconPath = resolveAppIcon()
  const baseIcon =
    iconPath && fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  const icon = baseIcon.isEmpty() ? nativeImage.createEmpty() : baseIcon.resize({ width: 24, height: 24 })
  tray = new Tray(icon)
  tray.setToolTip("Mantis Price Tracker")
  tray.setContextMenu(buildTrayMenu())
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

async function createWindow() {
  await ensureFrontendBuild()
  await waitForBackendPort()

  const iconPath = resolveAppIcon()
  const browserWindowOptions = {
    width: 1280,
    height: 720,
    show: false,
    backgroundColor: "#101418",
    title: "Mantis",
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  }

  mainWindow = new BrowserWindow(browserWindowOptions)

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-state", { maximized: true })
  })

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-state", { maximized: false })
  })

  mainWindow.on("close", (event) => {
    if (!appIsQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  const startUrl = process.env.ELECTRON_START_URL
  if (startUrl) {
    await mainWindow.loadURL(startUrl)
  } else {
    const packagedIndex = path.join(process.resourcesPath, "frontend", "index.html")
    const devIndex = path.join(__dirname, "../mantis/out/index.html")
    if (fs.existsSync(packagedIndex)) {
      await mainWindow.loadFile(packagedIndex)
    } else if (fs.existsSync(devIndex)) {
      await mainWindow.loadFile(devIndex)
    } else {
      await mainWindow.loadURL("data:text/html,<h1>Mantis Shell</h1><p>Frontend build not found.</p>")
    }
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })
}

ipcMain.handle("get-port", async () => {
  return await waitForBackendPort()
})

ipcMain.handle("refresh-all", async () => {
  await refreshAllProducts()
  return { ok: true }
})

ipcMain.handle("window-control", (_event, action) => {
  if (!mainWindow) {
    return
  }

  switch (action) {
    case "minimize":
      mainWindow.minimize()
      break
    case "toggle-maximize":
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      break
    case "close":
      if (mainWindow) {
        mainWindow.hide()
      }
      break
    default:
      break
  }
})

ipcMain.handle("window-get-state", () => ({
  maximized: mainWindow ? mainWindow.isMaximized() : false,
}))

ipcMain.handle("get-api-key-status", async () => {
  const key = getStoredApiKey()
  return {
    configured: Boolean(key),
    last4: key ? key.slice(-4) : null,
  }
})

async function restartBackend() {
  stopBackend()
  await startBackend()
}

ipcMain.handle("save-api-key", async (_event, apiKey) => {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("API key must be a non-empty string")
  }
  settings.apiKey = apiKey.trim()
  saveSettings()
  await restartBackend()
  return { ok: true }
})

function setupSingleInstanceLock() {
  const locked = app.requestSingleInstanceLock()
  if (!locked) {
    app.quit()
  } else {
    app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }
}

app.on("before-quit", () => {
  appIsQuitting = true
  stopBackend()
})

app.on("window-all-closed", (event) => {
  event.preventDefault()
})

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  setupSingleInstanceLock()
  if (isWindows) {
    app.setAppUserModelId("com.mantis.price-tracker")
  }
  Menu.setApplicationMenu(null)
  await startBackend()
  createTray()
  await createWindow()
})

app.on("will-quit", () => {
  stopBackend()
})

app.on("quit", () => {
  stopBackend()
})

process.on("exit", () => {
  stopBackend()
})

;["SIGINT", "SIGTERM", "SIGBREAK"].forEach((signal) => {
  process.on(signal, () => {
    stopBackend(signal)
    appIsQuitting = true
    app.quit()
  })
})

async function ensureFrontendBuild() {
  if (process.env.ELECTRON_START_URL) {
    return
  }

  const packagedIndex = path.join(process.resourcesPath, "frontend", "index.html")
  if (fs.existsSync(packagedIndex)) {
    return
  }

  const devOutDir = path.resolve(__dirname, "../mantis/out")
  const devIndex = path.join(devOutDir, "index.html")
  if (fs.existsSync(devIndex)) {
    return
  }

  const frontendRoot = path.resolve(__dirname, "../mantis")
  if (!fs.existsSync(frontendRoot)) {
    log("Frontend source directory missing; skipping build step.")
    return
  }

  if (!frontendBuildPromise) {
    log("Frontend build not found. Running `npm run build` in /mantis …")
    frontendBuildPromise = new Promise((resolve, reject) => {
      const buildProcess = spawn(npmCommand, ["run", "build"], {
        cwd: frontendRoot,
        stdio: "inherit",
      })

      buildProcess.on("exit", (code) => {
        if (code === 0) {
          log("Frontend build completed.")
          resolve()
        } else {
          reject(new Error(`Frontend build failed with exit code ${code}`))
        }
      })

      buildProcess.on("error", (error) => {
        reject(error)
      })
    }).finally(() => {
      frontendBuildPromise = null
    })
  }

  await frontendBuildPromise
}

