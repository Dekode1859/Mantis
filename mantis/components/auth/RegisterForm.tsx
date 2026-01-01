"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { MantisLogo } from "@/components/auth/MantisLogo"
import { signupInitiate, verifyOTP, getCurrentUser } from "@/lib/auth"
import Link from "next/link"

type Step = "DETAILS" | "OTP"

export function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>("DETAILS")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const emailParam = searchParams.get("email")
    if (emailParam) setEmail(emailParam)
  }, [searchParams])

  useEffect(() => {
    if (step === "OTP") {
      const timer = setTimeout(() => {
        const otpInput = document.querySelector('[data-input-otp]')
        if (otpInput instanceof HTMLElement) otpInput.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [step])

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    setIsLoading(true)
    try {
      await signupInitiate({ email, password, name: name.trim() || undefined })
      setStep("OTP")
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOTPSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      await verifyOTP({ email, otp })
      await getCurrentUser()
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid verification code")
      setOtp("")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await signupInitiate({ email, password, name: name.trim() || undefined })
      setOtp("")
      setError("New verification code sent! Check your email.")
      setTimeout(() => setError(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (otp.length === 6 && !isLoading) handleOTPSubmit()
  }, [otp])

  return (
    <div className="w-full max-w-md space-y-6">
      <MantisLogo />
      {step === "DETAILS" && (
        <>
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Create Account</h1>
            <p className="text-muted-foreground">Sign up to start tracking prices with Mantis</p>
          </div>
          <form onSubmit={handleDetailsSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (Optional)</Label>
              <Input id="name" type="text" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoading} minLength={8} />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} minLength={8} />
            </div>
            {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Sending code..." : "Continue"}</Button>
          </form>
          <div className="text-center text-sm">Already have an account? <Link href="/login" className="font-medium underline">Sign in</Link></div>
        </>
      )}
      {step === "OTP" && (
        <>
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Verify Your Email</h1>
            <p className="text-muted-foreground">Enter the 6-digit code sent to</p>
            <p className="font-medium">{email}</p>
          </div>
          <form onSubmit={handleOTPSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={(value) => setOtp(value)} disabled={isLoading} data-input-otp>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <p className="text-center text-xs text-muted-foreground">Code expires in 10 minutes</p>
            </div>
            {error && <div className={"rounded-md p-3 text-sm " + (error.includes("sent") ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive")}>{error}</div>}
            <div className="space-y-3">
              <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>{isLoading ? "Verifying..." : "Verify & Create Account"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={handleResendOTP} disabled={isLoading}>Resend Code</Button>
              <Button type="button" variant="link" className="w-full text-sm text-muted-foreground" onClick={() => { setStep("DETAILS"); setOtp(""); setError(null) }} disabled={isLoading}>← Back to registration</Button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
