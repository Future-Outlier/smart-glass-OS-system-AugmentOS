import {useAppTheme} from "@/utils/useAppTheme"
// eslint-disable-next-line no-restricted-imports
import {TextStyle, View, ViewStyle} from "react-native"
import {Spacer} from "@/components/ui/Spacer"
import {Text} from "@/components/ignite/Text"
import {ThemedStyle} from "@/theme"
import {Button} from "@/components/ignite"

interface BasicDialogProps {
  title: string
  description?: string | React.ReactNode
  icon?: React.ReactNode
  leftButtonText?: string
  rightButtonText: string
  onLeftPress?: () => void
  onRightPress: () => void
}

const BasicDialog = ({
  title,
  description,
  icon,
  leftButtonText,
  rightButtonText,
  onLeftPress,
  onRightPress,
}: BasicDialogProps) => {
  const {theme, themed} = useAppTheme()
  return (
    <View style={themed($container)}>
      <View style={themed($titleDescription)}>
        {icon}
        {title && <Text text={title} style={themed($headline)} />}
        {description && (
          <Text text={typeof description === "string" ? description : undefined} style={themed($description)}>
            {typeof description !== "string" ? description : undefined}
          </Text>
        )}
      </View>
      <Spacer height={theme.spacing.s12} />
      <View style={themed($actions)}>
        <View style={themed($actions1)}>
          {leftButtonText && (
            <Button flexContainer={false} flex={false} preset="alternate" text={leftButtonText} onPress={onLeftPress} />
          )}
          <Button flexContainer={false} flex={false} preset="primary" text={rightButtonText} onPress={onRightPress} />
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.primary_foreground,
  borderRadius: spacing.s4,
  borderWidth: 1,
  borderColor: colors.border,
  overflow: "hidden",
  elevation: 4,
  justifyContent: "center",
  maxWidth: "100%",
  minWidth: "50%",
  shadowColor: "rgba(0, 0, 0, 0.25)",
  shadowOffset: {
    width: 0,
    height: 4,
  },
  shadowOpacity: 1,
  shadowRadius: 4,
  width: "100%",
})

const $titleDescription: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignSelf: "stretch",
  gap: spacing.s4,
  justifyContent: "center",
  paddingHorizontal: 24,
  paddingTop: 24,
  alignItems: "center",
  overflow: "hidden",
})

const $headline: ThemedStyle<TextStyle> = ({colors}) => ({
  alignSelf: "stretch",
  color: colors.text,
  textAlign: "center",
  fontSize: 17,
  fontWeight: "500",
  letterSpacing: 1.7,
})

const $description: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.secondary_foreground,
  fontSize: 16,
  fontWeight: "bold",
  textAlign: "left",
})

const $actions: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  alignSelf: "stretch",
  overflow: "hidden",
})

const $actions1: ThemedStyle<ViewStyle> = ({spacing}) => ({
  gap: spacing.s4,
  overflow: "hidden",
  paddingBottom: 20,
  paddingLeft: 8,
  paddingRight: 24,
  paddingTop: 20,
  alignItems: "center",
  flexDirection: "row",
})

export default BasicDialog
