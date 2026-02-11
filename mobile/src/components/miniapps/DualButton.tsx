import {Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import { useAppTheme } from "@/contexts/ThemeContext"
import {useAppletStatusStore} from "@/stores/applets"
import {SETTINGS, useSetting} from "@/stores/settings"
import {useRef} from "react"
import {View} from "react-native"
import {Pressable} from "react-native-gesture-handler"
import {captureRef} from "react-native-view-shot"

interface DualButtonProps {
  onMinusPress?: () => void
  onEllipsisPress?: () => void
}

export function DualButton({onMinusPress, onEllipsisPress}: DualButtonProps) {
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  const {theme} = useAppTheme()
  return (
    <View className="flex-row gap-2 rounded-full bg-primary-foreground px-2 py-1 items-center">
      <Pressable hitSlop={10} onPress={onEllipsisPress}>
        <Icon name="ellipsis" color={theme.colors.foreground}/>
      </Pressable>
      <View className="h-4 w-px bg-gray-300" />
      <Pressable hitSlop={10} onPress={onMinusPress}>
        {/* outside of china, a minus likely makes more sense */}
        <Icon name={isChina ? "x" : "minus"} color={theme.colors.foreground}/>
      </Pressable>
    </View>
  )
}

export function MiniAppDualButtonHeader({
  packageName,
  viewShotRef,
  onEllipsisPress,
}: {
  packageName: string
  viewShotRef: React.RefObject<View | null>
  onEllipsisPress?: () => void
}) {
  const {goBack} = useNavigationHistory()

  const handleExit = async () => {
    // take a screenshot of the webview and save it to the applet zustand store:
    try {
      const uri = await captureRef(viewShotRef, {
        format: "jpg",
        quality: 0.5,
      })
      // save uri to zustand stoare
      await useAppletStatusStore.getState().saveScreenshot(packageName, uri)
    } catch (e) {
      console.warn("screenshot failed:", e)
    }
    goBack()
  }
  focusEffectPreventBack(() => {
    handleExit()
  }, true)
  return (
    <View className="z-2 absolute top-7.5 w-full items-center justify-end flex-row">
      <DualButton onMinusPress={handleExit} onEllipsisPress={onEllipsisPress} />
    </View>
  )
}
