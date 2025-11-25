import {AppState} from "react-native"
import {AsyncResult, result as Res, Result} from "typesafe-ts"

import {SETTINGS, useSettingsStore} from "@/stores/settings"

import {
  MentraAuthSession,
  MentraAuthUser,
  MentraPasswordResetResponse,
  MentraSigninResponse,
  MentraSignOutResponse,
} from "./authProvider.types"
import {AuthingWrapperClient} from "./provider/authingClient"
import {SupabaseWrapperClient} from "./provider/supabaseClient"

export interface AuthClient {
  onAuthStateChange(callback: (event: string, session: MentraAuthSession) => void): Result<any, Error>
  getUser(): AsyncResult<MentraAuthUser, Error>
  signUp(params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error>
  signInWithPassword(params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error>
  resetPasswordForEmail(email: string): AsyncResult<MentraPasswordResetResponse, Error>
  updateUserPassword(password: string): AsyncResult<void, Error>
  getSession(): AsyncResult<MentraAuthSession, Error>
  updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}): Promise<any>
  startAutoRefresh(): AsyncResult<void, Error>
  stopAutoRefresh(): AsyncResult<void, Error>
  signOut(): AsyncResult<MentraSignOutResponse, Error>
  appleSignIn(): AsyncResult<string, Error>
  googleSignIn(): AsyncResult<string, Error>
}

function unwrapResult<T>(res: Result<T, Error>): T {
  if (res.is_error()) {
    throw new Error(res.error.message)
  }
  return res.value
}

class MentraAuthClient {
  private client: Partial<AuthClient> | null = null
  private isInitialized = false

  private async init(): Promise<void> {
    if (this.isInitialized) {
      return
    }
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

  public onAuthStateChange(callback: (event: string, session: MentraAuthSession) => void): Result<any, Error> {
    if (!this.client?.onAuthStateChange) {
      return Res.error(new Error("No onAuthStateChange method found in client"))
    }
    return Res.ok(this.client.onAuthStateChange(callback))
  }

  public getUser(): AsyncResult<MentraAuthUser, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client!.getUser?.()
    })
  }

  public signup(email: string, password: string): AsyncResult<MentraSigninResponse, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.signUp?.({email, password})
    })
  }

  public signIn(email: string, password: string): AsyncResult<MentraSigninResponse, Error> {
    return Res.try_async(async () => {
      await this.init()
      if (this.client?.signInWithPassword) {
        const res = await this.client!.signInWithPassword({email, password})
        return unwrapResult(res)
      }
      throw new Error("No signInWithPassword method found in client")
    })
  }

  public resetPasswordForEmail(email: string): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.resetPasswordForEmail?.(email)
    })
  }

  public updateUserPassword(password: string): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.updateUserPassword?.(password)
    })
  }

  public updateSessionWithTokens(tokens: {access_token: string; refresh_token: string}): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.updateSessionWithTokens?.(tokens)
    })
  }

  public startAutoRefresh(): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.startAutoRefresh?.()
    })
  }

  public stopAutoRefresh(): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.stopAutoRefresh?.()
    })
  }

  public signOut(): AsyncResult<MentraSignOutResponse, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.signOut?.()
    })
  }

  public appleSignIn(): AsyncResult<string, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.appleSignIn?.()
    })
  }

  public googleSignIn(): AsyncResult<string, Error> {
    await this.init()
    return this.client?.googleSignIn?.()
  }

  public getSession(): AsyncResult<MentraAuthSession, Error> {
    return Res.try_async(async () => {
      await this.init()
      return this.client?.getSession?.()
    })
  }
}

const mentraAuth = new MentraAuthClient()
export default mentraAuth

// Tells Authing and Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
AppState.addEventListener("change", state => {
  if (state === "active") {
    console.log("MENTRA AUTH: START AUTO REFRESH")
    mentraAuth.startAutoRefresh()
  } else {
    console.log("MENTRA AUTH: STOP AUTO REFRESH")
    mentraAuth.stopAutoRefresh()
  }
})
