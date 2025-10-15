import type {SupabaseClient} from "@supabase/supabase-js"
import {supabase as supabaseClient} from "@/supabase/supabaseClient"
import {MentraOauthProviderResponse, MentraSigninResponse} from "../authProvider.types"

export class SupabaseWrapperClient {
  private static instance: SupabaseWrapperClient
  private supabase: SupabaseClient

  private constructor() {
    this.supabase = supabaseClient
  }

  public static async getInstance(): Promise<SupabaseWrapperClient> {
    if (!SupabaseWrapperClient.instance) {
      SupabaseWrapperClient.instance = new SupabaseWrapperClient()
    }
    return SupabaseWrapperClient.instance
  }

  public async getSession() {
    return this.supabase.auth.getSession()
  }

  public async signOut() {
    return this.supabase.auth.signOut()
  }

  public async signInWithPassword(credentials: {email: string; password: string}): Promise<MentraSigninResponse> {
    try {
      const {data, error} = await this.supabase.auth.signInWithPassword(credentials)

      return {
        data: data.user
          ? {
              session: {
                token: data.session.access_token,
                user: {
                  id: data.user.id,
                  email: data.user.email,
                  name: data.user.user_metadata.full_name as string,
                },
              },
              user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata.full_name as string,
              },
            }
          : null,
        error: error?.message
          ? {
              message: error.message,
            }
          : null,
      }
    } catch (error) {
      console.log("Supabase Sign-in error:", error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  public async signUp(credentials: {email: string; password: string}): Promise<MentraSigninResponse> {
    try {
      const {data, error} = await this.supabase.auth.signUp(credentials)
      let errorMessage = error?.message.toLowerCase() || ""
      if (error) {
        console.log("Supabase Sign-up error:", error)
      }
      // Try to detect if it's a Google or Apple account
      // Note: Supabase doesn't always tell us which provider, so we show a generic message
      if (
        errorMessage.includes("already registered") ||
        errorMessage.includes("user already registered") ||
        errorMessage.includes("email already exists") ||
        errorMessage.includes("identity already linked")
      ) {
        errorMessage = "Email already registered"
      } else {
        errorMessage = "Something went wrong. Please try again."
      }
      return {
        data: {
          user: data.user
            ? {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata.full_name as string,
              }
            : null,
          session:
            data.session && data.user
              ? {
                  token: data.session.access_token,
                  user: {
                    id: data.user.id,
                    email: data.user.email,
                    name: data.user.user_metadata.full_name as string,
                  },
                }
              : null,
        },
        error: error?.message
          ? {
              message: errorMessage,
            }
          : null,
      }
    } catch (error) {
      console.log("Supabase Sign-up error:", error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  public async googleSignIn(): Promise<MentraOauthProviderResponse> {
    try {
      const {data, error} = await this.supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Must match the deep link scheme/host/path in your AndroidManifest.xml
          redirectTo: "com.mentra://auth/callback",
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      })

      let errorMessage = error ? error.message.toLowerCase() : ""

      if (
        errorMessage.includes("already registered") ||
        errorMessage.includes("user already registered") ||
        errorMessage.includes("email already exists") ||
        errorMessage.includes("identity already linked")
      ) {
        errorMessage = "Email already registered"
      }

      return {
        data: data.url
          ? {
              url: data.url,
            }
          : null,
        error: error?.message
          ? {
              message: errorMessage,
            }
          : null,
      }
    } catch (error) {
      console.error("Error signing in with Google:", error)
      return {
        data: null,
        error: {
          message: "Error signing in with Google",
        },
      }
    }
  }

  public async appleSignIn(): Promise<MentraOauthProviderResponse> {
    try {
      const {data, error} = await this.supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          // Must match the deep link scheme/host/path in your AndroidManifest.xml
          redirectTo: "com.mentra://auth/callback",
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      })

      let errorMessage = error ? error.message.toLowerCase() : ""

      if (
        errorMessage.includes("already registered") ||
        errorMessage.includes("user already registered") ||
        errorMessage.includes("email already exists") ||
        errorMessage.includes("identity already linked")
      ) {
        errorMessage = "Email already registered"
      } else {
        errorMessage = "Something went wrong. Please try again."
      }

      return {
        data: data.url
          ? {
              url: data?.url,
            }
          : null,
        error: error?.message
          ? {
              message: errorMessage,
            }
          : null,
      }
    } catch (error) {
      console.error("Error signing in with Apple:", error)
      return {
        data: null,
        error: {
          message: "Error signing in with Apple",
        },
      }
    }
  }
}
