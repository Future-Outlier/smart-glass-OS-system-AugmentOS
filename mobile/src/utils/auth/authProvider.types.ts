export type MentraAuthUser = {
  id: string
  email?: string
  name: string
}

export type MentraAuthSession = {
  token?: string
  user?: MentraAuthUser
}

export type MentraOauthProviderResponse = {
  data: {
    url?: string
  } | null
  error: {
    message: string
  } | null
}

export type MentraSigninResponse = {
  data: {
    session: MentraAuthSession | null
    user: MentraAuthUser | null
  } | null
  error: {
    message: string
  } | null
}
