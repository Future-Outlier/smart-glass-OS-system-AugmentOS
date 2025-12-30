export type CrustMessageEventPayload = {
  message: string
}

export type CrustModuleEvents = {
  onChange: (params: ChangeEventPayload) => void
  CrustMessageEvent: (message: string) => void
}

export type ChangeEventPayload = {
  value: string
}
