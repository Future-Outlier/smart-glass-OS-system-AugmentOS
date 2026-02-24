import {Button, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useAppletStatusStore} from "@/stores/applets"
import {SETTINGS, useSetting} from "@/stores/settings"
import {BottomSheetBackdrop, BottomSheetModal} from "@gorhom/bottom-sheet"
import {View} from "react-native"
import {Pressable} from "react-native-gesture-handler"
import {captureRef} from "react-native-view-shot"
import {Text} from "@/components/ignite"
import {forwardRef, useCallback, useImperativeHandle, useRef} from "react"
import {useMemo} from "react"
import {useSaferAreaInsets} from "@/contexts/SaferAreaContext"

interface DualButtonProps {
  onMinusPress?: () => void
  onEllipsisPress?: () => void
}

export function DualButton({onMinusPress, onEllipsisPress}: DualButtonProps) {
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  const {theme} = useAppTheme()
  const bottomSheetRef = useRef<BottomSheetModal>(null)

  const handleEllipsisPress = useCallback(() => {
    if (onEllipsisPress) {
      onEllipsisPress()
    } else {
      bottomSheetRef.current?.present()
    }
  }, [onEllipsisPress])

  return (
    <View className="flex-row gap-2 rounded-full bg-primary-foreground px-2 py-1 items-center">
      <Pressable hitSlop={10} onPress={handleEllipsisPress}>
        <Icon name="ellipsis" color={theme.colors.foreground} />
      </Pressable>
      <View className="h-4 w-px bg-gray-300" />
      <Pressable hitSlop={10} onPress={onMinusPress}>
        <Icon name={isChina ? "x" : "minus"} color={theme.colors.foreground} />
      </Pressable>
      {!onEllipsisPress && <MiniAppMoreActionsSheet ref={bottomSheetRef} />}
      <MiniAppMoreActionsSheet ref={bottomSheetRef} />
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

export const MiniAppMoreActionsSheet = forwardRef<BottomSheetModal>((_, ref) => {
  const {theme} = useAppTheme()
  const snapPoints = useMemo(() => ["50%"], [])
  const internalRef = useRef<BottomSheetModal>(null)
  const insets = useSaferAreaInsets()

  // Merge refs so both the parent and internal ref work
  useImperativeHandle(ref, () => internalRef.current!)

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />,
    [],
  )

  return (
    <BottomSheetModal
      ref={internalRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{backgroundColor: theme.colors.primary_foreground}}
      handleIndicatorStyle={{backgroundColor: theme.colors.muted_foreground}}>
      <View className="px-4 flex-1" style={{paddingBottom: insets.bottom}}>
        <View className="gap-4 px-4 mb-2">
          <Text className="text-lg font-bold text-foreground text-center" tx="home:incompatibleApps" />
          <Text className="text-sm text-muted-foreground font-medium" tx="home:incompatibleAppsDescription" />
        </View>

        <View className="flex-1 flex-row gap-8">
          {/* share button, add to home button, uninstall button */}
          <View className="flex-1 flex-row gap-2 pb-4">
            <Button compactIcon onPress={() => {}} preset="secondary">
              <Icon name="trash" color={theme.colors.primary} size={60}/>
            </Button>
          </View>
          <Button tx="appInfo:addToHome" onPress={() => {}} />
          <Button tx="appInfo:uninstall" onPress={() => {}} />
        </View>

        <View className="flex-1 bg-red-500" />

        <Button
          tx="common:cancel"
          onPress={() => {
            internalRef.current?.dismiss()
          }}
        />
      </View>
    </BottomSheetModal>
  )
})
