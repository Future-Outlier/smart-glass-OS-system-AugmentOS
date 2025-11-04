import {Capabilities, DeviceTypes, getModelCapabilities} from "@/../../cloud/packages/types/src"
import OtaProgressSection from "@/components/glasses/OtaProgressSection"
import {RouteButton} from "@/components/ui/RouteButton"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n/translate"
import {useApplets} from "@/stores/applets"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert, {showDestructiveAlert} from "@/utils/AlertUtils"
import {PermissionFeatures, requestFeaturePermissions} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import CoreModule from "core"
import {Platform, View, ViewStyle} from "react-native"
import {Spacer} from "@/components/ui/Spacer"
import {BatteryStatus} from "./info/BatteryStatus"
import {DeviceInformation} from "./info/DeviceInformation"
import {EmptyState} from "./info/EmptyState"
import {NotConnectedInfo} from "./info/NotConnectedInfo"
import {AdvancedSettingsDropdown} from "./settings/AdvancedSettingsDropdown"
import {ButtonSettings} from "./settings/ButtonSettings"
import {MicrophoneSelector} from "./settings/MicrophoneSelector"
import {Group} from "@/components/ui/Group"
import SliderSetting from "@/components/settings/SliderSetting"
import ToggleSetting from "@/components/settings/ToggleSetting"

export default function DeviceSettings() {
  const {themed} = useAppTheme()
  const {status} = useCoreStatus()
  const isGlassesConnected = Boolean(status.glasses_info?.model_name)
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [preferredMic, setPreferredMic] = useSetting(SETTINGS_KEYS.preferred_mic)
  const [autoBrightness, setAutoBrightness] = useSetting(SETTINGS_KEYS.auto_brightness)
  const [brightness, setBrightness] = useSetting(SETTINGS_KEYS.brightness)
  const [showAdvancedSettings, setShowAdvancedSettings] = useSetting(SETTINGS_KEYS.show_advanced_settings)
  const [defaultButtonActionEnabled, setDefaultButtonActionEnabled] = useSetting(
    SETTINGS_KEYS.default_button_action_enabled,
  )
  const [defaultButtonActionApp, setDefaultButtonActionApp] = useSetting(SETTINGS_KEYS.default_button_action_app)
  const [devMode] = useSetting(SETTINGS_KEYS.dev_mode)

  const {push, goBack} = useNavigationHistory()
  const applets = useApplets()
  const features: Capabilities = getModelCapabilities(defaultWearable)

  // Check if we have any advanced settings to show
  const hasMicrophoneSelector =
    isGlassesConnected &&
    defaultWearable &&
    features?.hasMicrophone &&
    (defaultWearable !== "Mentra Live" ||
      (Platform.OS === "android" && status.glasses_info?.glasses_device_model !== "K900"))

  const hasDeviceInfo =
    status.glasses_info?.bluetooth_name ||
    status.glasses_info?.glasses_build_number ||
    status.glasses_info?.glasses_wifi_local_ip

  const hasAdvancedSettingsContent = hasMicrophoneSelector || hasDeviceInfo

  const setMic = async (val: string) => {
    if (val === "phone") {
      // We're potentially about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log("Microphone permission denied, cannot enable phone microphone")
        showAlert(
          "Microphone Permission Required",
          "Microphone permission is required to use the phone microphone feature. Please grant microphone permission in settings.",
          [{text: "OK"}],
          {
            iconName: "microphone",
            iconColor: "#2196F3",
          },
        )
        return
      }
    }

    setPreferredMic(val)
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.preferred_mic, val)
  }

  const confirmForgetGlasses = () => {
    showDestructiveAlert(
      translate("settings:forgetGlasses"),
      translate("settings:forgetGlassesConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {
          text: translate("common:yes"),
          onPress: () => {
            CoreModule.forget()
            goBack()
          },
        },
      ],
      {
        cancelable: false,
      },
    )
  }

  // Check if no glasses are paired at all
  if (!defaultWearable) {
    return <EmptyState />
  }

  return (
    <View style={themed($container)}>
      {/* Show helper text if glasses are paired but not connected */}
      {!status.glasses_info?.model_name && defaultWearable && <NotConnectedInfo />}

      {/* Screen settings for binocular glasses */}
      <Group
        title={translate("deviceSettings:display")}
        // subtitle={translate("settings:screenDescription")}
      >
        {defaultWearable && (features?.display?.count ?? 0 > 1) && (
          <RouteButton
            label={translate("settings:screenSettings")}
            // subtitle={translate("settings:screenDescription")}
            onPress={() => push("/settings/screen")}
          />
        )}
        {/* Only show dashboard settings if glasses have display capability */}
        {defaultWearable && features?.hasDisplay && (
          <RouteButton
            label={translate("settings:dashboardSettings")}
            // subtitle={translate("settings:dashboardDescription")}
            onPress={() => push("/settings/dashboard")}
          />
        )}
        {/* Brightness Settings */}
        {features?.display?.adjustBrightness && isGlassesConnected && (
          <ToggleSetting
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
            // containerStyle={{paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0}}
            disableBorder
          />
        )}
      </Group>

      {/* Battery Status Section */}
      {isGlassesConnected && <BatteryStatus />}

      {/* Nex Developer Settings - Only show when connected to Mentra Nex */}
      {defaultWearable && defaultWearable.includes(DeviceTypes.NEX) && (
        <RouteButton
          label="Nex Developer Settings"
          subtitle="Advanced developer tools and debugging features"
          onPress={() => push("/glasses/nex-developer-settings")}
        />
      )}
      {/* Mic selector has been moved to Advanced Settings section below */}

      {/* Camera Settings button moved to Gallery Settings page */}

      {/* Button Settings - Only show for glasses with configurable buttons */}
      {defaultWearable && features?.hasButton && (
        <ButtonSettings
          enabled={defaultButtonActionEnabled}
          selectedApp={defaultButtonActionApp}
          applets={applets}
          onEnabledChange={setDefaultButtonActionEnabled}
          onAppChange={setDefaultButtonActionApp}
        />
      )}

      {/* Only show WiFi settings if connected glasses support WiFi */}
      {defaultWearable && features?.hasWifi && (
        <RouteButton
          label={translate("settings:glassesWifiSettings")}
          subtitle={translate("settings:glassesWifiDescription")}
          onPress={() => {
            push("/pairing/glasseswifisetup", {deviceModel: status.glasses_info?.model_name || "Glasses"})
          }}
        />
      )}

      {/* Device info is rendered within the Advanced Settings section below */}

      {/* OTA Progress Section - Only show for Mentra Live glasses */}
      {defaultWearable && isGlassesConnected && defaultWearable.includes(DeviceTypes.LIVE) && (
        <OtaProgressSection otaProgress={status.ota_progress} />
      )}

      <Group title={translate("deviceSettings:general")}>
        {isGlassesConnected && defaultWearable !== DeviceTypes.SIMULATED && devMode && (
          <RouteButton
            // icon={}
            label={translate("deviceSettings:disconnectGlasses")}
            onPress={() => {
              CoreModule.disconnect()
            }}
          />
        )}

        {defaultWearable && (
          <RouteButton
            // icon={}
            label={translate("deviceSettings:unpairGlasses")}
            onPress={confirmForgetGlasses}
          />
        )}
      </Group>

      {/* Advanced Settings Dropdown - Only show if there's content */}
      {defaultWearable && hasAdvancedSettingsContent && (
        <AdvancedSettingsDropdown
          isOpen={showAdvancedSettings}
          onToggle={() => setShowAdvancedSettings(!showAdvancedSettings)}>
          {/* Microphone Selector */}
          {hasMicrophoneSelector && <MicrophoneSelector preferredMic={preferredMic} onMicChange={setMic} />}

          {/* Spacer between sections */}
          <Spacer height={16} />

          {/* Device Information */}
          {isGlassesConnected && <DeviceInformation />}
        </AdvancedSettingsDropdown>
      )}

      {/* this just gives the user a bit more space to scroll */}
      <Spacer height={160} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: 12,
  width: "100%",
  minHeight: 240,
  justifyContent: "center",
  backgroundColor: "transparent",
  gap: spacing.md,
})
