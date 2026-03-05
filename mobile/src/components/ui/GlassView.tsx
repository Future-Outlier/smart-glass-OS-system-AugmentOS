import {SETTINGS, useSetting} from "@/stores/settings"
import {GlassView as GlassViewComponent, GlassViewProps} from "expo-glass-effect"
import {View, ViewProps} from "react-native"
import {withUniwind} from "uniwind"

const GlassView = ({children, ...props}: GlassViewProps & ViewProps) => {
  const [iosGlassEffect] = useSetting(SETTINGS.ios_glass_effect.key)
  if (iosGlassEffect) {
    return <GlassViewComponent {...props}>{children}</GlassViewComponent>
  }
  return <View {...props}>{children}</View>
}

export default withUniwind(GlassView)
