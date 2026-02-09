import {Icon} from "@/components/ignite"
import {View} from "react-native"

export function DualButton() {
  return (
    <View className="flex-row gap-2 rounded-full bg-gray-100 p-2">
      <Icon name="ellipsis" />
      {/* <Divider */}
      {/* vertical divider */}
      <View className="h-4 w-px bg-gray-300" />
      <Icon name="x" />
    </View>
  )
}
