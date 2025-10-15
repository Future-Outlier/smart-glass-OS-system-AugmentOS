import {MentraOauthProviderResponse, MentraSigninResponse} from "./authProvider.types"
import {AuthingWrapperClient} from "./provider/authingClient"
import {SupabaseWrapperClient} from "./provider/supabaseClient"

const DEPLOYMENT_REGION = process.env.DEPLOYMENT_REGION || "global"
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

  async signup(email: string, password: string): Promise<MentraSigninResponse> {
    this.checkOrSetupClients()
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
    this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.signInWithPassword({
        email,
        password,
      })
    } else {
      return this.supabase!.signInWithPassword({
        email,
        password,
      })
    }
  }

  async getSession() {
    this.checkOrSetupClients()
    if (IS_CHINA) {
      console.log("Getting session with Authing...")
      return await this.authing!.getSession()
    } else {
      console.log("Getting session with Supabase...")
      return this.supabase!.getSession()
    }
  }

  async signOut() {
    this.checkOrSetupClients()
    if (IS_CHINA) {
      return this.authing!.signOut()
    } else {
      return this.supabase!.signOut()
    }
  }

  async appleSignIn(): Promise<MentraOauthProviderResponse> {
    this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Apple sign in not supported in China")
    } else {
      return this.supabase!.appleSignIn()
    }
  }

  async googleSignIn(): Promise<MentraOauthProviderResponse> {
    this.checkOrSetupClients()
    if (IS_CHINA) {
      throw new Error("Google sign in not supported in China")
    } else {
      return this.supabase!.googleSignIn()
    }
  }
}

export const mentraAuthProvider = new MentraAuthProvider()
