import {AppState} from "react-native"

import {SETTINGS, useSettingsStore} from "@/stores/settings"

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

export interface AuthClient {
  onAuthStateChange(
    callback: (event: string, session: MentraAuthSession) => void,
  ): MentraAuthStateChangeSubscriptionResponse
  getUser(): Promise<MentraAuthUserResponse>
  signUp(params: {email: string; password: string}): Promise<MentraSigninResponse>
  signInWithPassword(params: {email: string; password: string}): Promise<MentraSigninResponse>
  resetPasswordForEmail(email: string): Promise<MentraPasswordResetResponse>
  updateUserPassword(password: string): Promise<MentraUpdateUserPasswordResponse>
  getSession(): Promise<MentraAuthSessionResponse>
  updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}): Promise<any>
  startAutoRefresh(): Promise<void>
  stopAutoRefresh(): Promise<void>
  signOut(): Promise<MentraSignOutResponse>
  appleSignIn(): Promise<MentraOauthProviderResponse>
  googleSignIn(): Promise<MentraOauthProviderResponse>
}

class MentraAuthProvider {
  private client: Partial<AuthClient> | null = null

  private async init(): Promise<void> {
    const isChina = useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
    if (isChina) {
      this.client = await AuthingWrapperClient.getInstance()
    } else {
      this.client = await SupabaseWrapperClient.getInstance()
    }
  }

  constructor() {
    this.init()
  }

  async onAuthStateChange(callback: (event: string, session: MentraAuthSession) => void) {
    return this.client?.onAuthStateChange?.(callback)
  }

  async getUser() {
    return this.client?.getUser?.()
  }

  async signup(email: string, password: string) {
    return this.client?.signUp?.({email, password})
  }

  async signIn(email: string, password: string) {
    return this.client?.signInWithPassword?.({email, password})
  }

  async resetPasswordForEmail(email: string) {
    return this.client?.resetPasswordForEmail?.(email)
  }

  async updateUserPassword(password: string) {
    return this.client?.updateUserPassword?.(password)
  }

  async getSession() {
    return this.client?.getSession?.()
  }

  async updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}) {
    return this.client?.updateSessionWithTokens?.(tokens)
  }

  async startAutoRefresh() {
    return this.client?.startAutoRefresh?.()
  }

  async stopAutoRefresh() {
    return this.client?.stopAutoRefresh?.()
  }

  async signOut() {
    return this.client?.signOut?.()
  }

  async appleSignIn() {
    return this.client?.appleSignIn?.()
  }

  async googleSignIn() {
    return this.client?.googleSignIn()
  }
}

export const mentraAuthProvider = new MentraAuthProvider()

AppState.addEventListener("change", state => {
  if (state === "active") {
    mentraAuthProvider.startAutoRefresh()
  } else {
    mentraAuthProvider.stopAutoRefresh()
  }
})
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
