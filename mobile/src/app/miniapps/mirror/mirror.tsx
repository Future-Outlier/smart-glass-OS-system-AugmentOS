import {getModelCapabilities} from "@/../../cloud/packages/types/src"
import {useState, useEffect, useRef} from "react"
import {View, ViewStyle, TextStyle, ScrollView} from "react-native"

import {Header, Screen, Text} from "@/components/ignite"
import ToggleSetting from "@/components/settings/ToggleSetting"
import InfoCardSection from "@/components/ui/InfoCard"
import {RouteButton} from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {gallerySettingsService} from "@/services/asg/gallerySettingsService"
import {localStorageService} from "@/services/asg/localStorageService"
import {useGallerySyncStore} from "@/stores/gallerySync"
import {SETTINGS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {MiniAppDualButtonHeader} from "@/components/miniapps/DualButton"
import GlassesMirrorFullscreen from "@/app/mirror/fullscreen"
import GlassesDisplayMirror from "@/components/mirror/GlassesDisplayMirror"
import ConnectedSimulatedGlassesInfo from "@/components/mirror/ConnectedSimulatedGlassesInfo"
import {Group} from "@/components/ui"

export default function GallerySettingsScreen() {
  const {goBack, push} = useNavigationHistory()
  const {themed} = useAppTheme()
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)

  const [autoSaveToCameraRoll, setAutoSaveToCameraRoll] = useState(true)
  const [localPhotoCount, setLocalPhotoCount] = useState(0)
  const [localVideoCount, setLocalVideoCount] = useState(0)
  const [glassesPhotoCount, setGlassesPhotoCount] = useState(0)
  const [glassesVideoCount, setGlassesVideoCount] = useState(0)
  const [totalStorageSize, setTotalStorageSize] = useState(0)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const viewShotRef = useRef<View>(null)
  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} ref={viewShotRef}>
      <MiniAppDualButtonHeader packageName="com.mentra.mirror" viewShotRef={viewShotRef} />
      <View className="h-24" />

      {/* <GlassesMirrorFullscreen /> */}
      {/* <GlassesDisplayMirror style={{flex: 1}} /> */}
      <Group>
        <ConnectedSimulatedGlassesInfo showHeader={false} />
      </Group>
    </Screen>
  )
}
