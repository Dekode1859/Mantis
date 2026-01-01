/**
 * Authentication utilities for token management and API calls.
 */

import Cookies from "js-cookie"
import { resolveBackendBaseUrl } from "./backend"

const TOKEN_KEY = "mantis_auth_token"

export interface User {
  id: number
  email: string
  name: string | null
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  name?: string
}

export interface OTPResponse {
  message: string
  email: string
}

export interface VerifyOTPData {
  email: string
  otp: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface DeleteAccountResponse {
  message: string
}

/**
 * Store authentication token in localStorage
 */
export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token)
    Cookies.set(TOKEN_KEY, token, { expires: 30 }) // 30 days
  }
}

/**
 * Get authentication token from localStorage
 */
export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(TOKEN_KEY) || Cookies.get(TOKEN_KEY) || null
  }
  return null
}

/**
 * Remove authentication token
 */
export function removeToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY)
    Cookies.remove(TOKEN_KEY)
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getToken() !== null
}

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders(): HeadersInit {
  const token = getToken()
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    }
  }
  return {}
}

/**
 * Initiate signup by sending OTP to email (Step 1 of 2)
 */
export async function signupInitiate(data: RegisterData): Promise<OTPResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/signup-initiate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to send OTP")
  }

  return response.json()
}

/**
 * Verify OTP and complete registration (Step 2 of 2)
 */
export async function verifyOTP(data: VerifyOTPData): Promise<TokenResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Invalid or expired OTP")
  }

  const tokenData: TokenResponse = await response.json()
  setToken(tokenData.access_token)
  return tokenData
}

/**
 * Register a new user account (DEPRECATED - use signupInitiate + verifyOTP instead)
 * @deprecated Use the two-step OTP flow instead
 */
export async function register(data: RegisterData): Promise<TokenResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Registration failed")
  }

  const tokenData: TokenResponse = await response.json()
  setToken(tokenData.access_token)
  return tokenData
}

/**
 * Login with email and password
 */
export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Login failed")
  }

  const tokenData: TokenResponse = await response.json()
  setToken(tokenData.access_token)
  return tokenData
}

/**
 * Logout and clear authentication token
 */
export async function logout(): Promise<void> {
  const baseUrl = await resolveBackendBaseUrl()
  const token = getToken()

  if (token) {
    try {
      await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
        },
      })
    } catch (error) {
      console.error("Logout request failed:", error)
    }
  }

  removeToken()
}

/**
 * Get current user information
 */
export async function getCurrentUser(): Promise<User> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/me`, {
    headers: {
      ...getAuthHeaders(),
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      removeToken()
      throw new Error("Unauthorized")
    }
    throw new Error("Failed to get user information")
  }

  return response.json()
}

/**
 * Initiate account deletion by sending OTP to email (Step 1 of 2)
 */
export async function deleteAccountInitiate(): Promise<OTPResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/delete-initiate`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to send deletion OTP")
  }

  return response.json()
}

/**
 * Verify OTP and permanently delete account (Step 2 of 2)
 * ⚠️ WARNING: This action cannot be undone!
 */
export async function deleteAccountConfirm(otp: string): Promise<DeleteAccountResponse> {
  const baseUrl = await resolveBackendBaseUrl()
  const response = await fetch(`${baseUrl}/auth/delete-confirm`, {
    method: "DELETE",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ otp }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete account")
  }

  // Remove token after successful deletion
  removeToken()

  return response.json()
}
