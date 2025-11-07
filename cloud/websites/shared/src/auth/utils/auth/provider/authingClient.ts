import {AuthenticationClient, AuthenticationClientOptions} from "authing-js-sdk"
import {MentraAuthSessionResponse, MentraSigninResponse, MentraSignOutResponse} from "../authingProvider.types"

export class AuthingWrapperClient {
  private authing: AuthenticationClient
  constructor() {
    const authingOptions: AuthenticationClientOptions = {
      appId: process.env.AUTHING_APP_ID || "",
      appHost: process.env.AUTHING_APP_HOST || "",
      lang: "en-US",
    }
    this.authing = new AuthenticationClient(authingOptions)
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
    } catch (error) {
      console.error("Sign up error:", error)
      return {
        data: null,
        error: {
          message: "Failed to sign up",
        },
      }
    }
  }

  async signOut(): Promise<MentraSignOutResponse> {
    try {
      await this.authing.logout()
      return {error: null}
    } catch (error) {
      console.error("Sign out error:", error)
      return {error: {message: "Failed to sign out"}}
    }
  }
}
