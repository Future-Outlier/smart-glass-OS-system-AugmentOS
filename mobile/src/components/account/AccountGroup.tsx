import {View, ViewStyle} from "react-native"
import React from "react"
import RouteButton from "@/components/ui/RouteButton"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"

export const AccountGroup = ({title, children}: {title?: string; children?: React.ReactNode}) => {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

  const childrenArray = React.Children.toArray(children)
  const childrenWithProps = childrenArray.map((child, index) => {
    if (!React.isValidElement(child)) return child

    let position: "top" | "middle" | "bottom" | null
    if (childrenArray.length === 1) {
      position = null
    } else if (index === 0) {
      position = "top"
    } else if (index === childrenArray.length - 1) {
      position = "bottom"
    } else {
      position = "middle"
    }

    return React.cloneElement(child, {position} as any)
  })

  return (
    <View style={themed($container)}>
      {title && <Text>{title}</Text>}
      {childrenWithProps}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flex: 1,
  gap: spacing.xs,
  // padding: spacing.md,
  // backgroundColor: colors.error,
})
