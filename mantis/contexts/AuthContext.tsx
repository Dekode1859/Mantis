"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  LoginCredentials,
  RegisterData,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCurrentUser,
  isAuthenticated as checkAuth,
} from "@/lib/auth"

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Load user on mount
  useEffect(() => {
    async function loadUser() {
      if (checkAuth()) {
        try {
          const userData = await getCurrentUser()
          setUser(userData)
        } catch (error) {
          console.error("Failed to load user:", error)
          setUser(null)
        }
      }
      setIsLoading(false)
    }

    loadUser()
  }, [])

  const refreshUser = async () => {
    if (checkAuth()) {
      try {
        const userData = await getCurrentUser()
        setUser(userData)
      } catch (error) {
        console.error("Failed to refresh user:", error)
        setUser(null)
      }
    }
  }

  const login = async (credentials: LoginCredentials) => {
    try {
      await apiLogin(credentials)
      const userData = await getCurrentUser()
      setUser(userData)
      router.push("/")
    } catch (error) {
      throw error
    }
  }

  const register = async (data: RegisterData) => {
    try {
      await apiRegister(data)
      const userData = await getCurrentUser()
      setUser(userData)
      router.push("/")
    } catch (error) {
      throw error
    }
  }

  const logout = async () => {
    try {
      await apiLogout()
      setUser(null)
      router.push("/login")
    } catch (error) {
      console.error("Logout failed:", error)
      setUser(null)
      router.push("/login")
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
