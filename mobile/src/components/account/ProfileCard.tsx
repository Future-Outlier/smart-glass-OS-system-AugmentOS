import {Text} from "@/components/ignite"
import {supabase} from "@/supabase/supabaseClient"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useEffect, useState} from "react"
import {ActivityIndicator, Image, ImageStyle, TextStyle, View, ViewStyle} from "react-native"
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
  const {theme, themed} = useAppTheme()

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

  if (loading) {
    return (
      <View style={{height: 234, justifyContent: "center"}}>
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
  marginBottom: spacing.s2,
})

const $profilePlaceholder: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: 150,
  height: 150,
  borderRadius: 150,
  justifyContent: "center",
  alignItems: "center",
  alignSelf: "center",
  marginBottom: spacing.s2,
  backgroundColor: colors.border,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  gap: spacing.s1,
  marginBottom: spacing.s6,
})

const $nameText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  color: colors.secondary_foreground,
  fontWeight: 600,
})

const $emailText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.secondary_foreground,
  fontWeight: 600,
})
