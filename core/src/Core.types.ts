import type {StyleProp, ViewStyle} from "react-native"

export type OnLoadEventPayload = {
  url: string
}

export type CoreMessageEventPayload = {
  message: string
}

export type CoreModuleEvents = {
  onChange: (params: ChangeEventPayload) => void
  CoreMessageEvent: (message: string) => void
}

export type ChangeEventPayload = {
  value: string
}

export type CoreViewProps = {
  url: string
  onLoad: (event: {nativeEvent: OnLoadEventPayload}) => void
  style?: StyleProp<ViewStyle>
}
