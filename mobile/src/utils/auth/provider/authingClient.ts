import {AuthenticationClient} from "authing-js-sdk"
import type {AuthenticationClientOptions, User} from "authing-js-sdk"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {EventEmitter} from "events"
import {MentraAuthSessionResponse, MentraSigninResponse, MentraSignOutResponse} from "../authProvider.types"

interface Session {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  user?: User
}

const SESSION_KEY = "authing_session"

type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "PASSWORD_RECOVERY"

type AuthChangeCallback = (event: AuthChangeEvent, session: any) => void

interface Subscription {
  unsubscribe: () => void
}

export class AuthingWrapperClient {
  private authing: AuthenticationClient
  private eventEmitter: EventEmitter
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null
  private static instance: AuthingWrapperClient

  private constructor() {
    const authingOptions: AuthenticationClientOptions = {
      appId: process.env.AUTHING_APP_ID!,
      appHost: process.env.AUTHING_APP_HOST!,
      lang: "en-US",
    }
    this.authing = new AuthenticationClient(authingOptions)
    this.eventEmitter = new EventEmitter()
    this.setupTokenRefresh()
  }

  public static async getInstance(): Promise<AuthingWrapperClient> {
    if (!AuthingWrapperClient.instance) {
      AuthingWrapperClient.instance = new AuthingWrapperClient()
      const session = await AuthingWrapperClient.instance.readSessionFromStorage()

      if (session?.access_token) {
        AuthingWrapperClient.instance.authing.setToken(session.access_token)
        if (session.user) {
          AuthingWrapperClient.instance.authing.setCurrentUser(session.user)
        }
      }
    }
    return AuthingWrapperClient.instance
  }

  public onAuthStateChange(callback: AuthChangeCallback): Subscription {
    const handler = (event: string, session: Session) => {
      callback(event as AuthChangeEvent, session)
    }

    this.eventEmitter.on("SIGNED_IN", handler)
    this.eventEmitter.on("SIGNED_OUT", handler)
    this.eventEmitter.on("TOKEN_REFRESHED", handler)
    this.eventEmitter.on("USER_UPDATED", handler)
    this.eventEmitter.on("USER_DELETED", handler)
    this.eventEmitter.on("PASSWORD_RECOVERY", handler)

    return {
      unsubscribe: () => {
        this.eventEmitter.off("SIGNED_IN", handler)
        this.eventEmitter.off("SIGNED_OUT", handler)
        this.eventEmitter.off("TOKEN_REFRESHED", handler)
        this.eventEmitter.off("USER_UPDATED", handler)
        this.eventEmitter.off("USER_DELETED", handler)
        this.eventEmitter.off("PASSWORD_RECOVERY", handler)
      },
    }
  }

  public async signUp(credentials: {email: string; password: string}): Promise<MentraSigninResponse> {
    try {
      const user = await this.authing.registerByEmail(credentials.email, credentials.password)
      return {
        data: user
          ? {
              session: {
                token: user.token as string,
                user: {
                  id: user.id,
                  email: user.email!,
                  name: user.name || "",
                },
              },
              user: {
                id: user.id,
                email: user.email!,
                name: user.name || "",
              },
            }
          : null,
        error: null,
      }
    } catch (error) {
      console.error("Error signing up:", error)
      return {
        data: null,
        error: {
          message: "Failed to sign up",
        },
      }
    }
  }

  public async signInWithPassword(credentials: {email: string; password: string}): Promise<MentraSigninResponse> {
    try {
      const user = await this.authing.loginByEmail(credentials.email, credentials.password)
      const token = user.token
      const tokenExpiresAt = user.tokenExpiredAt

      console.log("Token expires at:", tokenExpiresAt)

      if (token && tokenExpiresAt) {
        const session: Session = {
          access_token: token,
          refresh_token: undefined, // Update this when implementing refresh token flow
          expires_at: Number(tokenExpiresAt),
          user,
        }
        await this.saveSession(session)
        this.eventEmitter.emit("SIGNED_IN", session)
        this.setupTokenRefresh()
        return {
          data: {
            session: {
              token: session.access_token,
              user: {
                id: session.user!.id,
                email: session.user!.email!,
                name: session.user!.name || "",
              },
            },
            user: {
              id: session.user!.id,
              email: session.user!.email!,
              name: session.user!.name || "",
            },
          },
          error: null,
        }
      }

      throw new Error("Failed to sign in")
    } catch (error) {
      console.error("Sign in error:", error)
      return {
        data: null,
        error: {
          message: "Failed to sign in",
        },
      }
    }
  }

  public async signOut(): Promise<MentraSignOutResponse> {
    try {
      await this.authing.logout()
      await this.clearSession()
      this.eventEmitter.emit("SIGNED_OUT", null)
      return {error: null}
    } catch (error) {
      console.error("Sign out error:", error)
      return {
        error: {
          message: "Failed to sign out",
        },
      }
    }
  }

  public async getSession(): Promise<MentraAuthSessionResponse> {
    try {
      const session = await this.readSessionFromStorage()
      return {
        data: {
          session: session
            ? {
                token: session.access_token,
                user: {
                  id: session.user!.id,
                  email: session.user!.email!,
                  name: session.user!.name || "",
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

  private async readSessionFromStorage(): Promise<Session | null> {
    const sessionJson = await AsyncStorage.getItem(SESSION_KEY)
    return sessionJson ? JSON.parse(sessionJson) : null
  }

  private async setupTokenRefresh() {
    try {
      const session = await this.readSessionFromStorage()
      if (!session?.access_token) return

      const now = Date.now()
      const expiresIn = session.expires_at! - now

      // If token is expired, clear session and emit SIGNED_OUT event
      if (expiresIn <= 0) {
        await this.clearSession()
        this.eventEmitter.emit("SIGNED_OUT", null)
        return
      }

      // Set timeout to refresh token before it expires (5 minutes before)
      const refreshTime = Math.max(0, expiresIn - 5 * 60 * 1000)

      this.refreshTimeout = setTimeout(async () => {
        try {
          await this.refreshToken()
          const user = await this.getCurrentUser()
          this.eventEmitter.emit("TOKEN_REFRESHED", user)
        } catch (error) {
          console.error("Token refresh failed:", error)
          await this.clearSession()
          this.eventEmitter.emit("SIGNED_OUT", null)
        }
      }, refreshTime)
    } catch (error) {
      console.error("Error setting up token refresh:", error)
      await this.clearSession()
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      const user = await this.authing.getCurrentUser()
      if (!user) {
        throw new Error("No user session")
      }
      // The authing-js-sdk should handle token refresh automatically
      // when making authenticated requests if the token is expired
      // This is just a placeholder in case you need custom refresh logic
      // For now throwing error
      // TODO: To be implemented and tested
      throw new Error("Token refresh not implemented")
      return
    } catch (error) {
      console.error("Failed to refresh token:", error)
      throw error
    }
  }

  private async getCurrentUser(): Promise<User | null> {
    try {
      return await this.authing.getCurrentUser()
    } catch (error) {
      console.error("Error getting current user:", error)
      return null
    }
  }

  private async saveSession(session: Session): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }

  private async clearSession(): Promise<void> {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }
    await AsyncStorage.removeItem(SESSION_KEY)
    // clears the session and user
    this.authing.logout()
  }
}

export const authingClient = AuthingWrapperClient.getInstance()

// TODO:
// Once we close the app the refresh thing would also turn off
// Fix that
