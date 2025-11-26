const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  getPort: () => ipcRenderer.invoke("get-port"),
  refreshAll: () => ipcRenderer.invoke("refresh-all"),
  getApiKeyStatus: () => ipcRenderer.invoke("get-api-key-status"),
  saveApiKey: (key) => ipcRenderer.invoke("save-api-key", key),
})

