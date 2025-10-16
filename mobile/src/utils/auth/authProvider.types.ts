export type MentraAuthUser = {
  id: string
  email?: string
  name: string
  avatarUrl?: string
  createdAt?: string
  provider?: string
}

export type MentraAuthSession = {
  token?: string
  user?: MentraAuthUser
}

export type MentraAuthSessionResponse = {
  data: {
    session: MentraAuthSession | null
  } | null
  error: {
    message: string
  } | null
}

export type MentraAuthUserResponse = {
  data: {
    user: MentraAuthUser | null
  } | null
  error: {
    message: string
  } | null
}

export type MentraSignOutResponse = {
  error: {
    message: string
  } | null
}

export type MentraUpdateUserPasswordResponse = {
  data: {} | null
  error: {
    message: string
  } | null
}

export type MentraPasswordResetResponse = {
  data: {} | null
  error: {
    message: string
  } | null
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
