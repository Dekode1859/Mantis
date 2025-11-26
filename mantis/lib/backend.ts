export function isElectron(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI !== "undefined"
}

export async function resolveBackendBaseUrl(): Promise<string> {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
  }

  if (isElectron()) {
    const port = await window.electronAPI!.getPort()
    return `http://127.0.0.1:${port}`
  }

  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
}

