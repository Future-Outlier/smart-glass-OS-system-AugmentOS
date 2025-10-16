import {
  MentraAuthSessionResponse,
  MentraAuthUserResponse,
  MentraOauthProviderResponse,
  MentraPasswordResetResponse,
  MentraSigninResponse,
  MentraSignOutResponse,
  MentraUpdateUserPasswordResponse,
} from "./authProvider.types"
import {AuthingWrapperClient} from "./provider/authingClient"
import {SupabaseWrapperClient} from "./provider/supabaseClient"
import Constants from "expo-constants"

const DEPLOYMENT_REGION = Constants.expoConfig?.extra?.DEPLOYMENT_REGION || "global"
const IS_CHINA = DEPLOYMENT_REGION === "china"

class MentraAuthProvider {
  private isSettingUpClients = false
  private authing?: AuthingWrapperClient
  private supabase?: SupabaseWrapperClient

  constructor() {
    this.checkOrSetupClients()
  }

  private async checkOrSetupClients() {
    if (this.isSettingUpClients && this.supabase && this.authing) return
    this.isSettingUpClients = true
    this.supabase = await SupabaseWrapperClient.getInstance()
    this.authing = await AuthingWrapperClient.getInstance()
  }

  async getUser(): Promise<MentraAuthUserResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.getUser()
    } else {
      return this.supabase!.getUser()
    }
  }

  async signup(email: string, password: string): Promise<MentraSigninResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.signUp({
        email,
        password,
      })
    } else {
      return this.supabase!.signUp({
        email,
        password,
      })
    }
  }

  async signIn(email: string, password: string): Promise<MentraSigninResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      console.log("Signing in with password in China")
      return this.authing!.signInWithPassword({
        email,
        password,
      })
    } else {
      console.log("Signing in with password in Global")
      return this.supabase!.signInWithPassword({
        email,
        password,
      })
    }
  }

  async resetPasswordForEmail(email: string): Promise<MentraPasswordResetResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      // return this.authing!.resetPasswordForEmail(email)
      throw new Error("Reset password for email not supported in China")
    } else {
      return this.supabase!.resetPasswordForEmail(email)
    }
  }

  async updateUserPassword(password: string): Promise<MentraUpdateUserPasswordResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Update user password not supported in China")
    } else {
      return this.supabase!.updateUserPassword(password)
    }
  }

  async getSession(): Promise<MentraAuthSessionResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.getSession()
    } else {
      return this.supabase!.getSession()
    }
  }

  async updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}) {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Update session with tokens not supported in China")
    } else {
      return this.supabase!.updateSessionWithTokens(tokens)
    }
  }

  async signOut(): Promise<MentraSignOutResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.signOut()
    } else {
      return this.supabase!.signOut()
    }
  }

  async appleSignIn(): Promise<MentraOauthProviderResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Apple sign in not supported in China")
    } else {
      return this.supabase!.appleSignIn()
    }
  }

  async googleSignIn(): Promise<MentraOauthProviderResponse> {
    await this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Google sign in not supported in China")
    } else {
      return this.supabase!.googleSignIn()
    }
  }
}

export const mentraAuthProvider = new MentraAuthProvider()
