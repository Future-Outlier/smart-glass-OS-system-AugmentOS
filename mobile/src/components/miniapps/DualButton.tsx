import {Icon} from "@/components/ignite"
import {SETTINGS, useSetting} from "@/stores/settings"
import {View} from "react-native"
import {Pressable} from "react-native-gesture-handler"

interface DualButtonProps {
  onMinusPress: () => void
  onEllipsisPress: () => void
}

export function DualButton({onMinusPress, onEllipsisPress}: DualButtonProps) {
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  return (
    <View className="flex-row gap-2 rounded-full bg-gray-100 px-2 py-1 items-center">
      <Pressable hitSlop={10} onPress={onEllipsisPress}>
        <Icon name="ellipsis" />
      </Pressable>
      <View className="h-4 w-px bg-gray-300" />
      <Pressable hitSlop={10} onPress={onMinusPress}>
        {/* outside of china, a minus likely makes more sense */}
        <Icon name={isChina ? "x" : "minus"} />
      </Pressable>
    </View>
  )
}
