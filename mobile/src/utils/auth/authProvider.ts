import {AppState} from "react-native"
import {
  MentraAuthSession,
  MentraAuthSessionResponse,
  MentraAuthStateChangeSubscriptionResponse,
  MentraAuthUserResponse,
  MentraOauthProviderResponse,
  MentraPasswordResetResponse,
  MentraSigninResponse,
  MentraSignOutResponse,
  MentraUpdateUserPasswordResponse,
} from "./authProvider.types"
import {AuthingWrapperClient} from "./provider/authingClient"
import {SupabaseWrapperClient} from "./provider/supabaseClient"
import {SETTINGS, useSettingsStore} from "@/stores/settings"
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

  async onAuthStateChange(
    callback: (event: string, session: MentraAuthSession) => void,
  ): Promise<MentraAuthStateChangeSubscriptionResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      return this.authing!.onAuthStateChange(callback)
    } else {
      return this.supabase!.onAuthStateChange(callback)
    }
  }

  async getUser(): Promise<MentraAuthUserResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      return this.authing!.getUser()
    } else {
      return this.supabase!.getUser()
    }
  }

  async signup(email: string, password: string): Promise<MentraSigninResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.signUp({
      email,
      password,
    })
  }

  async signIn(email: string, password: string): Promise<MentraSigninResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.signInWithPassword({
      email,
      password,
    })
  }

  async resetPasswordForEmail(email: string): Promise<MentraPasswordResetResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      // return this.authing!.resetPasswordForEmail(email)
      throw new Error("Reset password for email not supported in China")
    } else {
      return this.supabase!.resetPasswordForEmail(email)
    }
  }

  async updateUserPassword(password: string): Promise<MentraUpdateUserPasswordResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      throw new Error("Update user password not supported in China")
    } else {
      return this.supabase!.updateUserPassword(password)
    }
  }

  async getSession(): Promise<MentraAuthSessionResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.getSession()
  }

  async updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}) {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      throw new Error("Update session with tokens not supported in China")
    } else {
      return this.supabase!.updateSessionWithTokens(tokens)
    }
  }

  async startAutoRefresh(): Promise<void> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.startAutoRefresh()
  }

  async stopAutoRefresh(): Promise<void> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.stopAutoRefresh()
  }

  async signOut(): Promise<MentraSignOutResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    let auth = isChina ? this.authing! : this.supabase!
    return auth.signOut()
  }

  async appleSignIn(): Promise<MentraOauthProviderResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      throw new Error("Apple sign in not supported in China")
    } else {
      return this.supabase!.appleSignIn()
    }
  }

  async googleSignIn(): Promise<MentraOauthProviderResponse> {
    await this.checkOrSetupClients()
    const isChina = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      throw new Error("Google sign in not supported in China")
    } else {
      return this.supabase!.googleSignIn()
    }
  }
}

export const mentraAuthProvider = new MentraAuthProvider()

// Tells Authing and Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
AppState.addEventListener("change", state => {
  if (state === "active") {
    console.log("MENTRA AUTH: START AUTO REFRESH")
    mentraAuthProvider.startAutoRefresh()
  } else {
    console.log("MENTRA AUTH: STOP AUTO REFRESH")
    mentraAuthProvider.stopAutoRefresh()
  }
})
