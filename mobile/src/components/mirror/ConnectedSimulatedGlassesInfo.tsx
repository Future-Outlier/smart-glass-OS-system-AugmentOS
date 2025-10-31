import GlassesDisplayMirror from "@/components/mirror/GlassesDisplayMirror"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n/translate"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {useCameraPermissions} from "expo-camera"
import {Linking, Pressable, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {Text} from "@/components/ignite"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

export default function ConnectedSimulatedGlassesInfo({style}: {style?: ViewStyle}) {
  const {themed, theme} = useAppTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const {push} = useNavigationHistory()

  // Function to navigate to fullscreen mode
  const navigateToFullScreen = async () => {
    // Check if camera permission is already granted
    if (permission?.granted) {
      push("/mirror/fullscreen")
      return
    }

    // Show alert asking for camera permission
    showAlert(
      translate("mirror:cameraPermissionRequired"),
      translate("mirror:cameraPermissionRequiredMessage"),
      [
        {
          text: translate("common:continue"),
          onPress: async () => {
            const permissionResult = await requestPermission()
            if (permissionResult.granted) {
              // Permission granted, navigate to fullscreen
              push("/mirror/fullscreen")
            } else if (!permissionResult.canAskAgain) {
              // Permission permanently denied, show settings alert
              showAlert(
                translate("mirror:cameraPermissionRequired"),
                translate("mirror:cameraPermissionRequiredMessage"),
                [
                  {
                    text: translate("common:cancel"),
                    style: "cancel",
                  },
                  {
                    text: translate("mirror:openSettings"),
                    onPress: () => Linking.openSettings(),
                  },
                ],
              )
            }
            // If permission denied but can ask again, do nothing (user can try again)
          },
        },
      ],
      {
        iconName: "camera",
      },
    )
  }

  return (
    <View style={[themed($connectedContent), style]}>
      <View style={themed($header)}>
        <Text style={themed($title)} tx="home:simulatedGlasses" />
        <Pressable onPress={() => push("/settings/glasses")}>
          <MaterialCommunityIcons name="cog" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
      <View>
        <GlassesDisplayMirror fallbackMessage="Glasses Mirror" />
        <TouchableOpacity style={{position: "absolute", bottom: 10, right: 10}} onPress={navigateToFullScreen}>
          <Icon name="fullscreen" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const $connectedContent: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.primary_foreground,
  padding: spacing.lg,
  // alignItems: "center",
  // justifyContent: "center",
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingRight: spacing.sm,
  paddingBottom: spacing.sm,
})

const $title: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.secondary_foreground,
})
