import {Text} from "@/components/ignite"
import {useState} from "react"
import {ActivityIndicator, Image, ImageStyle, TextStyle, View, ViewStyle} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {DeviceTypes, getModelCapabilities} from "@/../../cloud/packages/types/src"
import {BatteryStatus} from "@/components/glasses/info/BatteryStatus"
import {Button} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {showAlert} from "@/utils/AlertUtils"
import {
  getEvenRealitiesG1Image,
  getGlassesClosedImage,
  getGlassesImage,
  getGlassesOpenImage,
} from "@/utils/getGlassesImage"
import {checkConnectivityRequirementsUI} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import CoreModule from "core"
import SliderSetting from "@/components/settings/SliderSetting"
import ToggleSetting from "@/components/settings/ToggleSetting"
import ConnectedSimulatedGlassesInfo from "../mirror/ConnectedSimulatedGlassesInfo"
import {Spacer} from "@/components/ui/Spacer"

export const CompactDeviceStatus = ({style}: {style?: ViewStyle}) => {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false)
  const isGlassesConnected = Boolean(status.glasses_info?.model_name)
  const [autoBrightness, setAutoBrightness] = useSetting(SETTINGS_KEYS.auto_brightness)
  const [brightness, setBrightness] = useSetting(SETTINGS_KEYS.brightness)
  const [showSimulatedGlasses, setShowSimulatedGlasses] = useState(false)

  // If no glasses paired, show Pair Glasses button
  if (!defaultWearable || defaultWearable === "null") {
    return (
      <View style={themed($disconnectedContainer)}>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
          RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
          onPress={() => push("/pairing/select-glasses-model")}
          tx="home:pairGlasses"
        />
      </View>
    )
  }

  if (defaultWearable.includes(DeviceTypes.SIMULATED)) {
    return <ConnectedSimulatedGlassesInfo style={style} mirrorStyle={{backgroundColor: theme.colors.background}} />
  }

  // Show simulated glasses view for simulated glasses
  // if (defaultWearable.includes(DeviceTypes.SIMULATED)) {
  // return <ConnectedSimulatedGlassesInfo />
  // }

  const connectGlasses = async () => {
    if (!defaultWearable) {
      push("/pairing/select-glasses-model")
      return
    }

    setIsCheckingConnectivity(true)

    try {
      const requirementsCheck = await checkConnectivityRequirementsUI()

      if (!requirementsCheck) {
        return
      }
    } catch (error) {
      console.error("connect to glasses error:", error)
      showAlert("Connection Error", "Failed to connect to glasses. Please try again.", [{text: "OK"}])
    } finally {
      setIsCheckingConnectivity(false)
    }
    await CoreModule.connectDefault()
  }

  const handleConnectOrDisconnect = async () => {
    if (status.core_info.is_searching) {
      await CoreModule.disconnect()
    } else {
      await connectGlasses()
    }
  }

  const getCurrentGlassesImage = () => {
    let image = getGlassesImage(defaultWearable)

    if (defaultWearable === DeviceTypes.G1) {
      const style = status.glasses_info?.glasses_style
      const color = status.glasses_info?.glasses_color
      let state = "folded"
      if (!status.glasses_info?.case_removed) {
        state = status.glasses_info?.case_open ? "case_open" : "case_close"
      }
      return getEvenRealitiesG1Image(style, color, state, "l", theme.isDark, status.glasses_info?.case_battery_level)
    }

    if (!status.glasses_info?.case_removed) {
      image = status.glasses_info?.case_open
        ? getGlassesOpenImage(defaultWearable)
        : getGlassesClosedImage(defaultWearable)
    }

    return image
  }

  if (status.core_info.is_searching || isCheckingConnectivity) {
    return (
      <View style={themed($disconnectedContainer)}>
        <View style={[themed($disconnectedImageContainer)]}>
          <Image source={getCurrentGlassesImage()} style={themed($disconnectedGlassesImage)} />
        </View>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginLeft: 5}} />}
          tx="home:connectingGlasses"
          // disabled={true}
          onPress={handleConnectOrDisconnect}
        />
      </View>
    )
  }
  let isConnected = status.glasses_info?.model_name
  let isSearching = status.core_info.is_searching || isCheckingConnectivity

  if (!isConnected || isSearching) {
    return (
      <View style={[themed($disconnectedContainer), style]}>
        {/* </View> */}

        <View style={themed($compactHeader)}>
          <Text style={themed($headerText)}>{defaultWearable}</Text>
          <MaterialCommunityIcons name="bluetooth" size={20} color={theme.colors.textDim} />
        </View>

        <View style={[themed($sideBySideContainer)]}>
          <Image
            source={getCurrentGlassesImage()}
            style={[themed($glassesImage), {width: "90%", paddingHorizontal: theme.spacing.lg}]}
          />
          <Button style={{width: 48, height: 48}} preset="alternate" onPress={() => push("/settings/glasses")}>
            <MaterialCommunityIcons name="cog" size={20} color={theme.colors.foreground} />
          </Button>
        </View>
        <Spacer height={theme.spacing.sm} />
        <View
          style={{
            flexDirection: "row",
            // alignItems: "center",
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          }}>
          {!isSearching ? (
            <>
              <Button compact flex tx="home:getSupport" preset="primary" />
              <Button compact flex tx="home:connectGlasses" preset="alternate" onPress={connectGlasses} />
            </>
          ) : (
            <Button
              textStyle={[{marginLeft: theme.spacing.xxl}]}
              textAlignment="left"
              LeftAccessory={() => (
                <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginLeft: 5}} />
              )}
              tx="home:connectingGlasses"
              onPress={handleConnectOrDisconnect}
            />
          )}
        </View>
        {/* <View style={[themed($disconnectedImageContainer)]}> */}
        {/* </View> */}
        {/* <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
          RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
          onPress={handleConnectOrDisconnect}
          tx="home:connectGlasses"
          disabled={isCheckingConnectivity}
        /> */}
      </View>
    )
  }

  const features = getModelCapabilities(defaultWearable)

  if (showSimulatedGlasses) {
    return (
      <View style={[themed($container), style]}>
        <View style={themed($compactHeader)}>
          <View style={{flexDirection: "row", alignItems: "center", gap: theme.spacing.xs}}>
            <View style={[themed($compactImageContainer)]}>
              <Image source={getCurrentGlassesImage()} style={themed($glassesImage)} />
            </View>
            <Text style={themed($headerText)}>{defaultWearable}</Text>
          </View>
          <MaterialCommunityIcons name="bluetooth" size={20} color={theme.colors.textDim} />
        </View>
        <ConnectedSimulatedGlassesInfo showHeader={false} mirrorStyle={{backgroundColor: theme.colors.background}} />

        <View style={themed($statusContainer)}>
          <View style={{flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.xs}}>
            <Button
              style={{width: 48, height: 48}}
              preset="alternate"
              onPress={() => setShowSimulatedGlasses(!showSimulatedGlasses)}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.foreground} />
            </Button>
            <Button style={{width: 48, height: 48}} preset="alternate" onPress={() => push("/settings/glasses")}>
              <MaterialCommunityIcons name="cog" size={20} color={theme.colors.foreground} />
            </Button>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={[themed($container), style]}>
      <View style={themed($header)}>
        <Text style={themed($headerText)}>{defaultWearable}</Text>
        <MaterialCommunityIcons name="bluetooth" size={20} color={theme.colors.textDim} />
      </View>
      <View style={[themed($imageContainer)]}>
        <Image source={getCurrentGlassesImage()} style={themed($glassesImage)} />
      </View>

      <View style={themed($statusContainer)}>
        {/* <View style={themed($statusRow)}> */}
        {/* <Icon icon="battery" size={16} color={theme.colors.textDim} /> */}
        {/* <Text style={[themed($statusText), {height: 22}]} numberOfLines={1}> */}
        {/* {batteryLevel !== -1 ? `${batteryLevel}%` : <ActivityIndicator size="small" color={theme.colors.text} />} */}
        {/* </Text> */}
        {/* </View> */}

        {/* {hasDisplay && (
          <View style={themed($statusRow)}>
            <SunIcon size={16} color={theme.colors.textDim} />
            <Text style={themed($statusText)} numberOfLines={1}>
              {autoBrightness ? "Auto" : `${status.glasses_settings?.brightness}%`}
            </Text>
          </View>
        )} */}
        <Group>
          {/* Brightness Settings */}
          {features?.display?.adjustBrightness && isGlassesConnected && (
            <ToggleSetting
              style={{backgroundColor: theme.colors.background}}
              label={translate("deviceSettings:autoBrightness")}
              value={autoBrightness}
              onValueChange={setAutoBrightness}
            />
          )}
          {features?.display?.adjustBrightness && isGlassesConnected && !autoBrightness && (
            <SliderSetting
              label={translate("deviceSettings:brightness")}
              value={brightness}
              min={0}
              max={100}
              onValueChange={() => {}}
              onValueSet={setBrightness}
              disableBorder
            />
          )}
        </Group>

        <BatteryStatus compact={true} />

        <View style={{flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.xs}}>
          <Button
            tx="home:glassesMirror"
            style={{flex: 1}}
            preset="alternate"
            onPress={() => setShowSimulatedGlasses(!showSimulatedGlasses)}
          />
          <Button style={{width: 48, height: 48}} preset="alternate" onPress={() => push("/settings/glasses")}>
            <MaterialCommunityIcons name="cog" size={20} color={theme.colors.foreground} />
          </Button>
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  paddingVertical: spacing.md,
  backgroundColor: colors.primary_foreground,
})

const $imageContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 2,
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "stretch",
  paddingHorizontal: spacing.md,
})

const $compactImageContainer: ThemedStyle<ViewStyle> = () => ({
  width: 64,
  height: 24,
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "stretch",
})

const $glassesImage: ThemedStyle<ImageStyle> = ({spacing}) => ({
  width: "100%",
  height: 100,
  resizeMode: "contain",
  paddingHorizontal: spacing.xxl,
})

const $compactHeader: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.sm,
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.sm,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  fontSize: 16,
  fontWeight: "bold",
  // fontFamily: "Inter-Regular",
})

const $sideBySideContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.xl,
})

const $statusContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.sm,
  flex: 1,
  paddingHorizontal: spacing.md,
  gap: spacing.sm,
})

const $disconnectedContainer: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  backgroundColor: colors.primary_foreground,
  alignItems: "center",
  paddingBottom: spacing.sm,
  gap: spacing.xs,
  paddingTop: spacing.md,
})

const $disconnectedImageContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: "100%",
  alignItems: "center",
  // borderColor: colors.border,
  // borderWidth: spacing.xxxs,
  padding: spacing.sm,
  backgroundColor: colors.primary_foreground,
  borderRadius: spacing.lg,
  marginBottom: spacing.sm,
})

const $disconnectedGlassesImage: ThemedStyle<ImageStyle> = () => ({
  // width: "80%",
  height: 100,
  resizeMode: "contain",
})
