import {View, ViewStyle} from "react-native"
import React from "react"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"

export const Group = ({title, style, children}: {title?: string; style?: ViewStyle; children?: React.ReactNode}) => {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

  const childrenArray = React.Children.toArray(children)

  // hide if no child elements:
  if (!childrenArray.length) return null

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

    let containerStyle
    if (position === "top") {
      containerStyle = themed($top)
    } else if (position === "bottom") {
      containerStyle = themed($bottom)
    } else if (position === "middle") {
      containerStyle = themed($middle)
    }

    return React.cloneElement(child, {
      key: index,
      style: [child.props.style, containerStyle],
    } as any)

    // return React.cloneElement(child, {position} as any)
  })

  return (
    <View style={[themed($container), style]}>
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

const $top: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.md,
  borderBottomLeftRadius: spacing.xxs,
  borderBottomRightRadius: spacing.xxs,
})

const $bottom: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.md,
  borderTopLeftRadius: spacing.xxs,
  borderTopRightRadius: spacing.xxs,
})

const $middle: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.xxs,
})
