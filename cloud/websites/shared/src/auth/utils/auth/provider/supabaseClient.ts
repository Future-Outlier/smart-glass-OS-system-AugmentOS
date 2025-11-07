import type {AuthChangeEvent, Session, SupabaseClient} from "@supabase/supabase-js"
import {supabase as supabaseClient} from "../../supabase.ts"
import {
  MentraAuthSessionResponse,
  MentraAuthStateChangeSubscriptionResponse,
  MentraPasswordResetResponse,
  MentraSigninResponse,
  MentraSignOutResponse,
} from "../authingProvider.types.ts"

export class SupabaseWrapperClient {
  private supabase: SupabaseClient

  constructor() {
    this.supabase = supabaseClient
  }

  async getSession(): Promise<MentraAuthSessionResponse> {
    try {
      const {data, error} = await this.supabase.auth.getSession()
      return {
        data: {
          session: data.session
            ? {
                token: data.session.access_token,
                user: {
                  id: data.session.user.id,
                  email: data.session.user.email,
                  name: data.session.user.user_metadata.full_name as string,
                },
              }
            : null,
        },
        error: error?.message
          ? {
              message: error.message,
            }
          : null,
      }
    } catch (error) {
      console.error(error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  async refreshUser(): Promise<MentraAuthSessionResponse> {
    try {
      return this.getSession()
    } catch (error) {
      console.error(error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  async signInWithEmail(email: string, password: string): Promise<MentraSigninResponse> {
    try {
      const {data, error} = await this.supabase.auth.signInWithPassword({
        email,
        password,
      })
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
      console.error(error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  async signUpWithEmail(email: string, password: string, redirectTo?: string): Promise<MentraSigninResponse> {
    try {
      const {data, error} = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      })
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
      console.error(error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<MentraPasswordResetResponse> {
    try {
      const {data, error} = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      return {
        data,
        error: error
          ? {
              message: error.message,
            }
          : null,
      }
    } catch (error) {
      console.error(error)
      return {
        data: null,
        error: {
          message: "Something went wrong. Please try again.",
        },
      }
    }
  }

  async signOut(): Promise<MentraSignOutResponse> {
    const {error} = await this.supabase.auth.signOut()
    return {error}
  }

  public onAuthStateChange(callback: (event: string, session: any) => void): MentraAuthStateChangeSubscriptionResponse {
    try {
      const wrappedCallback = (event: AuthChangeEvent, session: Session | null) => {
        const modifiedSession = {
          token: session?.access_token,
          user: {
            id: session?.user.id,
            email: session?.user.email,
            name: session?.user.user_metadata.full_name as string,
            avatarUrl: session?.user.user_metadata?.avatar_url || session?.user.user_metadata?.picture,
            createdAt: session?.user.created_at,
            provider: session?.user.user_metadata.provider,
          },
        }

        console.log("AuthContext: Modified session:", modifiedSession)

        callback(event, modifiedSession)
      }

      const {data} = this.supabase.auth.onAuthStateChange(wrappedCallback)

      return {
        data,
        error: null,
      }
    } catch (error) {
      console.error("Error in onAuthStateChange:", error)
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        },
      }
    }
  }
}
