const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  getPort: () => ipcRenderer.invoke("get-port"),
  refreshAll: () => ipcRenderer.invoke("refresh-all"),
  getApiKeyStatus: () => ipcRenderer.invoke("get-api-key-status"),
  saveApiKey: (key) => ipcRenderer.invoke("save-api-key", key),
  minimizeWindow: () => ipcRenderer.invoke("window-control", "minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window-control", "toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-control", "close"),
  getWindowState: () => ipcRenderer.invoke("window-get-state"),
  onWindowStateChange: (callback) => {
    if (typeof callback !== "function") {
      return () => {}
    }
    const handler = (_event, state) => callback(state)
    ipcRenderer.on("window-state", handler)
    return () => {
      ipcRenderer.removeListener("window-state", handler)
    }
  },
})

