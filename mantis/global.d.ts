export {}

declare global {
  interface Window {
    electronAPI?: {
      getPort(): Promise<number>
      refreshAll(): Promise<{ ok: boolean }>
      getApiKeyStatus(): Promise<{ configured: boolean; last4: string | null }>
      saveApiKey(key: string): Promise<{ ok: boolean }>
    }
  }
}

