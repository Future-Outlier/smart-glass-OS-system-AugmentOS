import {translate} from "@/i18n"

/**
 * Maps raw Supabase/auth error messages to user-friendly translated strings.
 * This prevents showing cryptic error messages like "Anonymous sign-ins are disabled"
 * to end users.
 */
export const mapAuthError = (error: Error | string): string => {
  const msg = typeof error === "string" ? error.toLowerCase() : error.message.toLowerCase()

  // Invalid credentials
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    return translate("login:errors.invalidCredentials")
  }

  // Anonymous/empty credentials
  if (msg.includes("anonymous")) {
    return translate("login:errors.enterCredentials")
  }

  // Password too short
  if (msg.includes("password") && (msg.includes("6") || msg.includes("short") || msg.includes("characters"))) {
    return translate("login:errors.passwordTooShort")
  }

  // Email already registered
  if (
    msg.includes("already registered") ||
    msg.includes("user already registered") ||
    msg.includes("email already exists")
  ) {
    return translate("login:errors.emailAlreadyRegistered")
  }

  // Duplicate signup - we already sent verification email
  if (msg.includes("duplicate_signup")) {
    return translate("login:errors.alreadySentEmail")
  }

  // Network/connection errors
  if (
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("failed to fetch")
  ) {
    return translate("login:errors.networkError")
  }

  // Invalid email format
  if (msg.includes("invalid email") || msg.includes("valid email")) {
    return translate("login:invalidEmail")
  }

  // User not found
  if (msg.includes("user not found") || msg.includes("no user")) {
    return translate("login:errors.invalidCredentials")
  }

  // Email not confirmed
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return translate("login:errors.emailNotConfirmed")
  }

  // Rate limiting
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return translate("login:errors.tooManyAttempts")
  }

  // Generic fallback - return a user-friendly generic message
  return translate("login:errors.genericError")
}

/**
 * Special error codes that we throw from our auth client
 * that need special handling (e.g., showing success instead of error)
 */
export const AUTH_ERROR_CODES = {
  DUPLICATE_SIGNUP: "DUPLICATE_SIGNUP",
} as const

/**
 * Check if an error is a duplicate signup error
 */
export const isDuplicateSignupError = (error: Error | string): boolean => {
  const msg = typeof error === "string" ? error : error.message
  return msg === AUTH_ERROR_CODES.DUPLICATE_SIGNUP || msg.toLowerCase().includes("duplicate_signup")
}
