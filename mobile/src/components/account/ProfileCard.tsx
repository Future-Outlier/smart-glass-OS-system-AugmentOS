import {useState, useEffect} from "react"
import {View, Image, ActivityIndicator, ScrollView, ImageStyle, TextStyle, ViewStyle, Modal} from "react-native"
import {supabase} from "@/supabase/supabaseClient"
import {Header, Screen, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {router} from "expo-router"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import ActionButton from "@/components/ui/ActionButton"
import showAlert from "@/utils/AlertUtils"
import {LogoutUtils} from "@/utils/LogoutUtils"
import restComms from "@/services/RestComms"
import {useAuth} from "@/contexts/AuthContext"
import Svg, {Path} from "react-native-svg"

// Default user icon component for profile pictures
const DefaultUserIcon = ({size = 100, color = "#999"}: {size?: number; color?: string}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
        fill={color}
      />
      <Path d="M12 14C6.47715 14 2 17.5817 2 22H22C22 17.5817 17.5228 14 12 14Z" fill={color} />
    </Svg>
  )
}

export const ProfileCard = () => {
  const [userData, setUserData] = useState<{
    fullName: string | null
    avatarUrl: string | null
    email: string | null
    createdAt: string | null
    provider: string | null
  } | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const {goBack, push, replace} = useNavigationHistory()
  const {logout} = useAuth()

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true)
      try {
        const {
          data: {user},
          error,
        } = await supabase.auth.getUser()
        if (error) {
          console.error(error)
          setUserData(null)
        } else if (user) {
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null
          const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
          const email = user.email || null
          const createdAt = user.created_at || null
          const provider = user.app_metadata?.provider || null

          setUserData({
            fullName,
            avatarUrl,
            email,
            createdAt,
            provider,
          })
        }
      } catch (error) {
        console.error(error)
        setUserData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [])

  const handleRequestDataExport = () => {
    console.log("Profile: Navigating to data export screen")
    push("/settings/data-export")
  }

  const handleChangePassword = () => {
    console.log("Profile: Navigating to change password screen")
    push("/settings/change-password")
  }

  const handleDeleteAccount = () => {
    console.log("Profile: Starting account deletion process - Step 1")

    // Step 1: Initial warning
    showAlert(
      translate("profileSettings:deleteAccountWarning1Title"),
      translate("profileSettings:deleteAccountWarning1Message"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {
          text: translate("common:continue"),
          onPress: () => {
            console.log("Profile: User passed step 1 - Step 2")

            // Step 2: Generic confirmation - delay to let first modal close
            setTimeout(() => {
              showAlert(
                translate("profileSettings:deleteAccountTitle"),
                translate("profileSettings:deleteAccountMessage"),
                [
                  {text: translate("common:cancel"), style: "cancel"},
                  {
                    text: translate("common:continue"),
                    onPress: () => {
                      console.log("Profile: User passed step 2 - Step 3")

                      // Step 3: Final severe warning - delay to let second modal close
                      setTimeout(() => {
                        showAlert(
                          translate("profileSettings:deleteAccountWarning2Title"),
                          translate("profileSettings:deleteAccountWarning2Message") +
                            "\n\n" +
                            "⚠️ THIS IS YOUR FINAL CHANCE TO CANCEL ⚠️",
                          [
                            {text: translate("common:cancel"), style: "cancel"},
                            {
                              text: "DELETE PERMANENTLY",
                              onPress: proceedWithAccountDeletion,
                            },
                          ],
                          {cancelable: false},
                        )
                      }, 100)
                    },
                  },
                ],
                {cancelable: false},
              )
            }, 100)
          },
        },
      ],
      {cancelable: false},
    )
  }

  const proceedWithAccountDeletion = async () => {
    console.log("Profile: User confirmed account deletion - proceeding")

    let deleteRequestSuccessful = false

    try {
      console.log("Profile: Requesting account deletion from server")
      const response = await restComms.requestAccountDeletion()

      // Check if the response indicates success
      deleteRequestSuccessful = response && (response.success === true || response.status === "success")
      console.log("Profile: Account deletion request successful:", deleteRequestSuccessful)
    } catch (error) {
      console.error("Profile: Error requesting account deletion:", error)
      deleteRequestSuccessful = false
    }

    // Always perform logout regardless of deletion request success
    try {
      console.log("Profile: Starting comprehensive logout")
      await LogoutUtils.performCompleteLogout()
      console.log("Profile: Logout completed successfully")
    } catch (logoutError) {
      console.error("Profile: Error during logout:", logoutError)
      // Continue with navigation even if logout fails
    }

    // Show appropriate message based on deletion request result
    if (deleteRequestSuccessful) {
      showAlert(
        translate("profileSettings:deleteAccountSuccessTitle"),
        translate("profileSettings:deleteAccountSuccessMessage"),
        [
          {
            text: translate("common:ok"),
            onPress: () => router.replace("/"),
          },
        ],
        {cancelable: false},
      )
    } else {
      showAlert(
        translate("profileSettings:deleteAccountPendingTitle"),
        translate("profileSettings:deleteAccountPendingMessage"),
        [
          {
            text: translate("common:ok"),
            onPress: () => router.replace("/"),
          },
        ],
        {cancelable: false},
      )
    }
  }

  const handleSignOut = async () => {
    try {
      console.log("Profile: Starting sign-out process")
      setIsSigningOut(true)

      await logout()

      console.log("Profile: Logout completed, navigating to login")

      // Reset the loading state before navigation
      setIsSigningOut(false)

      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      replace("/")
    } catch (err) {
      console.error("Profile: Error during sign-out:", err)
      setIsSigningOut(false)

      // Show user-friendly error but still navigate to login to prevent stuck state
      showAlert(translate("common:error"), translate("settings:signOutError"), [
        {
          text: translate("common:ok"),
          onPress: () => replace("/"),
        },
      ])
    }
  }

  const confirmSignOut = () => {
    showAlert(
      translate("settings:signOut"),
      translate("settings:signOutConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {text: translate("common:yes"), onPress: handleSignOut},
      ],
      {cancelable: false},
    )
  }

  const {theme, themed} = useAppTheme()

  if (loading) {
    return (
      <View>
        <ActivityIndicator size="large" color={theme.colors.palette.primary500} />
      </View>
    )
  }

  if (!userData) {
    return (
      <View>
        <Text tx="profileSettings:errorGettingUserInfo" />
      </View>
    )
  }

  return (
    <View>
      {userData.avatarUrl ? (
        <Image source={{uri: userData.avatarUrl}} style={themed($profileImage)} />
      ) : (
        <View style={themed($profilePlaceholder)}>
          <DefaultUserIcon size={60} color={theme.colors.textDim} />
        </View>
      )}

      <View style={themed($infoContainer)}>
        <Text text={userData.fullName || "N/A"} style={themed($nameText)} />
        <Text text={userData.email || "N/A"} style={themed($emailText)} />
      </View>
    </View>
  )
}

const $profileImage: ThemedStyle<ImageStyle> = ({spacing}) => ({
  width: 150,
  height: 150,
  borderRadius: 150,
  alignSelf: "center",
  marginBottom: spacing.xs,
})

const $profilePlaceholder: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: 150,
  height: 150,
  borderRadius: 150,
  justifyContent: "center",
  alignItems: "center",
  alignSelf: "center",
  marginBottom: spacing.xs,
  backgroundColor: colors.border,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  gap: spacing.xxs,
  marginBottom: spacing.lg,
})

const $nameText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  color: colors.secondary_foreground,
  fontWeight: 600,
})

const $emailText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.secondary_foreground,
  fontWeight: 600,
})
