import {AuthenticationClient, AuthenticationClientOptions} from "authing-js-sdk"
import {
  MentraAuthSession,
  MentraAuthSessionResponse,
  MentraAuthStateChangeSubscriptionResponse,
  MentraSigninResponse,
  MentraSignOutResponse,
} from "../authingProvider.types"

// Browser-compatible EventEmitter
type EventCallback = (...args: unknown[]) => void

class EventEmitter {
  private listeners: Map<string, EventCallback[]> = new Map()

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) callbacks.splice(index, 1)
    }
  }

  emit(event: string, data: unknown) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }
}

type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "PASSWORD_RECOVERY"

type AuthChangeCallback = (event: AuthChangeEvent, session: any) => void

export class AuthingWrapperClient {
  private authing: AuthenticationClient
  private eventEmitter: EventEmitter
  constructor() {
    const authingOptions: AuthenticationClientOptions = {
      appId: import.meta.env.VITE_AUTHING_APP_ID || "",
      appHost: import.meta.env.VITE_AUTHING_APP_HOST || "",
      lang: "en-US",
    }
    this.authing = new AuthenticationClient(authingOptions)
    this.eventEmitter = new EventEmitter()
  }

  async getSession(): Promise<MentraAuthSessionResponse> {
    try {
      const currentUser = await this.authing.getCurrentUser()
      return {
        data: {
          session: currentUser
            ? {
                token: currentUser.token!,
                user: {
                  id: currentUser.id,
                  email: currentUser.email!,
                  name: currentUser.name || "",
                },
              }
            : null,
        },
        error: null,
      }
    } catch (error) {
      console.error("Error getting session:", error)
      return {
        data: null,
        error: {
          message: "Failed to get session",
        },
      }
    }
  }

  async signInWithEmail(email: string, password: string): Promise<MentraSigninResponse> {
    try {
      const user = await this.authing.loginByEmail(email, password)
      const authSession: MentraAuthSession = {
        token: user.token!,
        user: {
          id: user.id,
          email: user.email!,
          name: user.name || "",
        },
      }
      this.eventEmitter.emit("SIGNED_IN", authSession)
      return {
        data: {
          user: {
            id: user.id,
            email: user.email!,
            name: user.name || "",
          },
          session: authSession,
        },
        error: null,
      }
    } catch (error: any) {
      console.error("Sign in error:", error)
      return {
        data: null,
        error: {
          message: error.message || "Failed to sign in",
        },
      }
    }
  }

  async signUpWithEmail(email: string, password: string, _redirectTo?: string): Promise<MentraSigninResponse> {
    try {
      const user = await this.authing.registerByEmail(email, password)
      return {
        data: {
          user: {
            id: user.id,
            email: user.email!,
            name: user.name || "",
          },
          session: {
            token: user.token!,
            user: {
              id: user.id,
              email: user.email!,
              name: user.name || "",
            },
          },
        },
        error: null,
      }
    } catch (error: any) {
      console.error("Sign up error:", error)
      return {
        data: null,
        error: {
          message: error.message || "Failed to sign up",
        },
      }
    }
  }

  async signOut(): Promise<MentraSignOutResponse> {
    try {
      await this.authing.logout()
      this.eventEmitter.emit("SIGNED_OUT", null)
      return {error: null}
    } catch (error: any) {
      console.error("Sign out error:", error)
      return {error: {message: error.message || "Failed to sign out"}}
    }
  }

  public onAuthStateChange(callback: AuthChangeCallback): MentraAuthStateChangeSubscriptionResponse {
    const handler = (event: string, session: MentraAuthSession) => {
      callback(event as AuthChangeEvent, session)
    }

    this.eventEmitter.on("SIGNED_IN", (session: MentraAuthSession) => handler("SIGNED_IN", session))
    this.eventEmitter.on("SIGNED_OUT", (session: MentraAuthSession) => handler("SIGNED_OUT", session))
    this.eventEmitter.on("TOKEN_REFRESHED", (session: MentraAuthSession) => handler("TOKEN_REFRESHED", session))
    this.eventEmitter.on("USER_UPDATED", (session: MentraAuthSession) => handler("USER_UPDATED", session))
    this.eventEmitter.on("USER_DELETED", (session: MentraAuthSession) => handler("USER_DELETED", session))
    this.eventEmitter.on("PASSWORD_RECOVERY", (session: MentraAuthSession) => handler("PASSWORD_RECOVERY", session))

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.eventEmitter.off("SIGNED_IN", handler)
            this.eventEmitter.off("SIGNED_OUT", handler)
            this.eventEmitter.off("TOKEN_REFRESHED", handler)
            this.eventEmitter.off("USER_UPDATED", handler)
            this.eventEmitter.off("USER_DELETED", handler)
            this.eventEmitter.off("PASSWORD_RECOVERY", handler)
          },
        },
      },
      error: null,
    }
  }
}
