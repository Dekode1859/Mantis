"""
Email service using Resend for sending verification emails.
"""

import os
from typing import Optional

import resend

# Resend configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "noreply@mantis.com")
OTP_EXPIRATION_MINUTES = int(os.getenv("OTP_EXPIRATION_MINUTES", "10"))

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send_verification_email(to_email: str, otp: str, name: Optional[str] = None) -> bool:
    """
    Send OTP verification email using Resend.

    Args:
        to_email: Recipient email address
        otp: 6-digit OTP code
        name: Optional user name for personalization

    Returns:
        True if email sent successfully, False otherwise

    Raises:
        Exception: If Resend API key is not configured
    """
    if not RESEND_API_KEY:
        raise Exception("RESEND_API_KEY environment variable is not set")

    # Personalized greeting
    greeting = f"Hi {name}," if name else "Hello,"

    # Email content
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - Mantis</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Mantis Price Tracker</h1>
        </div>

        <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">{greeting}</p>

            <p style="font-size: 16px; margin-bottom: 30px;">
                Thank you for signing up for Mantis! Please verify your email address to complete your registration.
            </p>

            <div style="background: #f7f7f7; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 5px;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your verification code is:</p>
                <p style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 10px 0; font-family: 'Courier New', monospace;">
                    {otp}
                </p>
            </div>

            <p style="font-size: 14px; color: #666; margin-bottom: 30px;">
                This code will expire in <strong>{OTP_EXPIRATION_MINUTES} minutes</strong>.
            </p>

            <p style="font-size: 14px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                If you didn't create an account with Mantis, you can safely ignore this email.
            </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© 2025 Mantis Price Tracker. All rights reserved.</p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
{greeting}

Thank you for signing up for Mantis! Please verify your email address to complete your registration.

Your verification code is: {otp}

This code will expire in {OTP_EXPIRATION_MINUTES} minutes.

If you didn't create an account with Mantis, you can safely ignore this email.

---
© 2025 Mantis Price Tracker. All rights reserved.
    """

    try:
        params = {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": f"Verify Your Email - Your Code: {otp}",
            "html": html_content,
            "text": text_content,
        }

        response = resend.Emails.send(params)
        return True

    except Exception as e:
        print(f"Failed to send email to {to_email}: {str(e)}")
        return False


def send_account_deletion_email(to_email: str, otp: str, name: Optional[str] = None) -> bool:
    """
    Send account deletion warning email with OTP using Resend.

    Args:
        to_email: Recipient email address
        otp: 6-digit OTP code
        name: Optional user name for personalization

    Returns:
        True if email sent successfully, False otherwise

    Raises:
        Exception: If Resend API key is not configured
    """
    if not RESEND_API_KEY:
        raise Exception("RESEND_API_KEY environment variable is not set")

    greeting = f"Hi {name}," if name else "Hello,"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Deletion Warning - Mantis</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Account Deletion Warning</h1>
        </div>

        <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">{greeting}</p>

            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 30px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 16px; color: #991b1b; font-weight: bold;">
                    ⚠️ WARNING: This action cannot be undone!
                </p>
            </div>

            <p style="font-size: 16px; margin-bottom: 20px;">
                You requested to <strong>permanently delete your Mantis account</strong>. This is an irreversible action.
            </p>

            <div style="background: #fff7ed; border: 2px solid #f97316; padding: 20px; margin: 20px 0; border-radius: 5px;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #7c2d12; font-weight: bold;">
                    The following data will be permanently deleted:
                </p>
                <ul style="margin: 10px 0; padding-left: 20px; color: #7c2d12;">
                    <li>All tracked products and price history</li>
                    <li>All API keys and provider configurations</li>
                    <li>Your account and profile information</li>
                    <li>All associated data and preferences</li>
                </ul>
            </div>

            <p style="font-size: 16px; margin: 30px 0 10px 0; color: #666;">
                If you're sure you want to proceed, enter this verification code:
            </p>

            <div style="background: #f7f7f7; border-left: 4px solid #dc2626; padding: 20px; margin: 30px 0; border-radius: 5px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your deletion code is:</p>
                <p style="font-size: 36px; font-weight: bold; color: #dc2626; letter-spacing: 8px; margin: 10px 0; font-family: 'Courier New', monospace;">
                    {otp}
                </p>
            </div>

            <p style="font-size: 14px; color: #666; margin-bottom: 30px;">
                This code will expire in <strong>{OTP_EXPIRATION_MINUTES} minutes</strong>.
            </p>

            <div style="background: #f0f9ff; border: 1px solid #3b82f6; padding: 15px; margin: 30px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 14px; color: #1e40af;">
                    💡 <strong>Changed your mind?</strong> Simply ignore this email and your account will remain active.
                </p>
            </div>

            <p style="font-size: 14px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                If you didn't request account deletion, please secure your account immediately by changing your password.
            </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© 2025 Mantis Price Tracker. All rights reserved.</p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
{greeting}

⚠️ WARNING: This action cannot be undone!

You requested to permanently delete your Mantis account. This is an irreversible action.

The following data will be permanently deleted:
- All tracked products and price history
- All API keys and provider configurations
- Your account and profile information
- All associated data and preferences

If you're sure you want to proceed, enter this verification code: {otp}

This code will expire in {OTP_EXPIRATION_MINUTES} minutes.

💡 Changed your mind? Simply ignore this email and your account will remain active.

If you didn't request account deletion, please secure your account immediately by changing your password.

---
© 2025 Mantis Price Tracker. All rights reserved.
    """

    try:
        params = {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "⚠️ Account Deletion Warning - Verify to Delete",
            "html": html_content,
            "text": text_content,
        }

        response = resend.Emails.send(params)
        return True

    except Exception as e:
        print(f"Failed to send deletion email to {to_email}: {str(e)}")
        return False
