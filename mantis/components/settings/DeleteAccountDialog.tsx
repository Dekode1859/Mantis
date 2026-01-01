"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { deleteAccountInitiate, deleteAccountConfirm } from "@/lib/auth"

type Step = "WARNING" | "OTP"

interface DeleteAccountDialogProps {
  userEmail: string
}

export function DeleteAccountDialog({ userEmail }: DeleteAccountDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("WARNING")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendOTP = async () => {
    setLoading(true)
    setError(null)

    try {
      await deleteAccountInitiate()
      setStep("OTP")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDeletion = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await deleteAccountConfirm(otp)
      // Account deleted successfully, redirect to login
      router.push("/login")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account")
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setOpen(false)
      setStep("WARNING")
      setOtp("")
      setError(null)
    }
  }

  const handleOtpChange = (value: string) => {
    setOtp(value)
    setError(null)

    // Auto-submit when 6 digits entered
    if (value.length === 6) {
      setTimeout(() => {
        handleConfirmDeletion()
      }, 100)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose()
      } else {
        setOpen(true)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === "WARNING" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-6 w-6" />
                <DialogTitle className="text-destructive">Delete Account</DialogTitle>
              </div>
              <DialogDescription className="text-base space-y-3 pt-2">
                <p className="font-medium text-foreground">
                  This action cannot be undone. This will permanently delete your account and remove all data.
                </p>
                <div className="bg-muted p-4 rounded-md space-y-2">
                  <p className="font-medium text-foreground">The following data will be deleted:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>All products and price tracking history</li>
                    <li>API keys and provider configurations</li>
                    <li>Account information and preferences</li>
                    <li>Email notifications and settings</li>
                  </ul>
                </div>
                <p className="text-destructive font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  WARNING: This action is irreversible!
                </p>
              </DialogDescription>
            </DialogHeader>
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSendOTP}
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "OTP" && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Account Deletion</DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <p>
                  We've sent a 6-digit verification code to <strong>{userEmail}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Enter the code to permanently delete your account.
                </p>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-4">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={handleOtpChange}
                  disabled={loading}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>

                {error && (
                  <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-md text-sm w-full text-center">
                    {error}
                  </div>
                )}

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the code?
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleSendOTP}
                    disabled={loading}
                    className="h-auto p-0"
                  >
                    Resend Code
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("WARNING")
                  setOtp("")
                  setError(null)
                }}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeletion}
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Deleting..." : "Delete Account"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
