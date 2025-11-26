import {useFocusEffect} from "@react-navigation/native"
import {useCallback} from "react"
import {ScrollView, View, ViewStyle} from "react-native"

import {HomeContainer} from "@/components/home/HomeContainer"
import {OfflineModeButton} from "@/components/home/OfflineModeButton"
import PermissionsWarning from "@/components/home/PermissionsWarning"
import {Header, Screen} from "@/components/ignite"
import CloudConnection from "@/components/misc/CloudConnection"
import NonProdWarning from "@/components/misc/NonProdWarning"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {useRefreshApplets} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

export default function Homepage() {
  const {themed, theme} = useAppTheme()
  const refreshApplets = useRefreshApplets()

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        refreshApplets()
      }, 1000)
    }, []),
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.s6}}>
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={themed($headerRight)}>
            <PermissionsWarning />
            <OfflineModeButton />
            <NonProdWarning />
          </View>
        }
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <CloudConnection />
        <SensingDisabledWarning />
        <HomeContainer />
      </ScrollView>
    </Screen>
  )
}

const $headerRight: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.s3,
})
