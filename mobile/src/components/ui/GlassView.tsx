import {SETTINGS, useSetting} from "@/stores/settings"
import {GlassView as GlassViewComponent, GlassViewProps, isLiquidGlassAvailable} from "expo-glass-effect"
import {Platform, View, ViewProps} from "react-native"
import {withUniwind} from "uniwind"

const GlassView = ({children, style, ...props}: GlassViewProps & ViewProps) => {
  const [iosGlassEffect] = useSetting(SETTINGS.ios_glass_effect.key)
  if (iosGlassEffect && isLiquidGlassAvailable()) {
    return (
      <GlassViewComponent style={[style, {backgroundColor: "transparent"}]} {...props}>
        {children}
      </GlassViewComponent>
    )
  }
  if (Platform.OS === "android") {
    return (
      <GlassViewComponent style={style} {...props}>
        {children}
      </GlassViewComponent>
    )
  }
  return (
    <View style={style} {...props}>
      {children}
    </View>
  )
}

export default withUniwind(GlassView)
