import {AuthenticationClient} from "authing-js-sdk"
import type {AuthenticationClientOptions, User} from "authing-js-sdk"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {EventEmitter} from "events"
import {RequestResultSafeDestructure} from "@supabase/supabase-js"

interface Session {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  user?: User
}

type SignInResponse = RequestResultSafeDestructure<{
  session: Session
  user: User
}>

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

const authingOptions: AuthenticationClientOptions = {
  appId: process.env.EXPO_PUBLIC_AUTHING_APP_ID!,
  appHost: process.env.EXPO_PUBLIC_AUTHING_APP_HOST!,
  lang: "en-US",
}

export class AuthingClient {
  private authing: AuthenticationClient
  private eventEmitter: EventEmitter
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null
  private static instance: AuthingClient

  private constructor() {
    this.authing = new AuthenticationClient(authingOptions)
    this.eventEmitter = new EventEmitter()
    this.setupTokenRefresh()
  }

  public static async getInstance(): Promise<AuthingClient> {
    if (!AuthingClient.instance) {
      AuthingClient.instance = new AuthingClient()
      const session = await AuthingClient.instance.getSession()

      if (session?.access_token) {
        AuthingClient.instance.authing.setToken(session.access_token)
        if (session.user) {
          AuthingClient.instance.authing.setCurrentUser(session.user)
        }
      }
    }
    return AuthingClient.instance
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

  public async signUp(credentials: {email: string; password: string}) {
    try {
      const user = await this.authing.registerByEmail(credentials.email, credentials.password)
      return user
    } catch (error) {
      console.error("Error signing up:", error)
      throw error
    }
  }

  public async signInWithPassword(credentials: {email: string; password: string}): Promise<SignInResponse> {
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
        return {data: {session, user}, error: null}
      }

      throw new Error("Failed to sign in")
    } catch (error) {
      console.error("Sign in error:", error)
      return {
        data: {session: null, user: null},
        error,
      }
    }
  }

  public async signOut() {
    try {
      await this.authing.logout()
      await this.clearSession()
      this.eventEmitter.emit("SIGNED_OUT", null)
      return {error: null}
    } catch (error) {
      console.error("Sign out error:", error)
      return {error}
    }
  }

  public async getSession(): Promise<Session | null> {
    const sessionJson = await AsyncStorage.getItem(SESSION_KEY)
    return sessionJson ? JSON.parse(sessionJson) : null
  }

  private async setupTokenRefresh() {
    try {
      const session = await this.getSession()
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

export const authingClient = AuthingClient.getInstance()
