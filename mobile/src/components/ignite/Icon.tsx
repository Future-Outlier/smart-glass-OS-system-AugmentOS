import {createIconSet} from "@expo/vector-icons"
import {
  Bell,
  CircleUser,
  FileType2,
  Fullscreen,
  Glasses,
  LayoutDashboard,
  Locate,
  Unlink,
  Unplug,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react-native"
import {
  Image,
  ImageStyle,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"
import Svg, {Path} from "react-native-svg"

import {useAppTheme} from "@/utils/useAppTheme"

export type IconTypes = keyof typeof iconRegistry

type BaseIconProps = {
  /**
   * The name of the icon
   */
  name: IconTypes

  /**
   * An optional tint color for the icon
   */
  color?: string

  /**
   * An optional background color for the icon
   */
  backgroundColor?: string

  /**
   * An optional size for the icon. If not provided, the icon will be sized to the icon's resolution.
   */
  size?: number

  /**
   * Style overrides for the icon image
   */
  style?: StyleProp<ImageStyle>

  /**
   * Style overrides for the icon container
   */
  containerStyle?: StyleProp<ViewStyle>
}

type PressableIconProps = Omit<TouchableOpacityProps, "style"> & BaseIconProps
type IconProps = Omit<ViewProps, "style"> & BaseIconProps

/**
 * A component to render a registered icon.
 * It is wrapped in a <TouchableOpacity />
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Icon/}
 * @param {PressableIconProps} props - The props for the `PressableIcon` component.
 * @returns {JSX.Element} The rendered `PressableIcon` component.
 */
export function PressableIcon(props: PressableIconProps) {
  const {
    name,
    color,
    // backgroundColor,
    size,
    // style: $imageStyleOverride,
    containerStyle: $containerStyleOverride,
    ...pressableProps
  } = props

  const {theme} = useAppTheme()

  return (
    <TouchableOpacity {...pressableProps} style={$containerStyleOverride}>
      <Icon name={name} size={size} color={color ?? theme.colors.secondary_foreground} />
    </TouchableOpacity>
  )
}

const glyphMap = require("@assets/icons/tabler/glyph-map.json")
const TablerIcon = createIconSet(glyphMap, "tablerIcons", "tabler-icons.ttf")

const lucideIcons = {
  "circle-user": CircleUser,
  "fullscreen": Fullscreen,
  "glasses": Glasses,
  "bell": Bell,
  "file-type-2": FileType2,
  "user-round": UserRound,
  "wifi": Wifi,
  "unplug": Unplug,
  "unlink": Unlink,
  "locate": Locate,
  "layout-dashboard": LayoutDashboard,
  "wifi-off": WifiOff,
}

/**
 * A component to render a registered icon.
 * It is wrapped in a <View />, use `PressableIcon` if you want to react to input
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Icon/}
 * @param {IconProps} props - The props for the `Icon` component.
 * @returns {JSX.Element} The rendered `Icon` component.
 */
export function Icon(props: IconProps) {
  const {name, color, size, style: $imageStyleOverride, containerStyle: $containerStyleOverride, ...viewProps} = props

  const {theme} = useAppTheme()

  const $imageStyle: StyleProp<ImageStyle> = [
    $imageStyleBase,
    {tintColor: color ?? theme.colors.text},
    size !== undefined && {width: size, height: size},
    $imageStyleOverride,
  ]

  const $textStyle: StyleProp<TextStyle> = [
    size !== undefined && {fontSize: size, lineHeight: size, width: size, height: size},
  ]

  // Special handling for custom icons
  if (name === "shopping-bag") {
    // Shopping bag icon SVG (unselected state)
    const iconSize = size ?? 24
    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 25 25" fill="none">
          <Path
            d="M3 6.44238V20.4424C3 20.9728 3.21071 21.4815 3.58579 21.8566C3.96086 22.2317 4.46957 22.4424 5 22.4424H19C19.5304 22.4424 20.0391 22.2317 20.4142 21.8566C20.7893 21.4815 21 20.9728 21 20.4424V6.44238"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M3 6.44238H21" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <Path
            d="M8 5.55762C8 4.49675 8.42143 3.47933 9.17157 2.72919C9.92172 1.97904 10.9391 1.55762 12 1.55762C13.0609 1.55762 14.0783 1.97904 14.8284 2.72919C15.5786 3.47934 16 4.49675 16 5.55762"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    )
  }

  if (name === "home") {
    // Home icon SVG (unselected state)
    const iconSize = size ?? 24
    const fillColor = theme.colors.background
    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
            fill={fillColor}
          />
          <Path d="M9 22V12H15V22" fill={fillColor} />
          <Path
            d="M9 22V12H15V22M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    )
  }

  if (name === "home-filled") {
    // Home icon SVG (selected state)
    const iconSize = size ?? 24
    const fillColor = theme.colors.background
    const strokeColor = theme.colors.primary
    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
            fill={fillColor}
          />
          <Path d="M9 22V12H15V22" fill={fillColor} />
          <Path
            d="M9 22V12H15V22M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    )
  }

  if (name === "shopping-bag-filled") {
    // Filled shopping bag icon SVG (selected state)
    const iconSize = size ?? 24
    const strokeColor = theme.colors.primary
    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 25 25" fill="none">
          {/* Handle arc - filled */}
          <Path
            d="M8 5.55664C8 4.49577 8.42143 3.47836 9.17157 2.72821C9.92172 1.97807 10.9391 1.55664 12 1.55664C13.0609 1.55664 14.0783 1.97807 14.8284 2.72821C15.5786 3.47836 16 4.49578 16 5.55664"
            fill={color}
          />
          {/* Bag body - filled */}
          <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 6.4419V20.4419C3 20.9723 3.21071 21.481 3.58579 21.8561C3.96086 22.2312 4.46957 22.4419 5 22.4419H19C19.5304 22.4419 20.0391 22.2312 20.4142 21.8561C20.7893 21.481 21 20.9723 21 20.4419V6.4419H3Z"
            fill={color}
          />
          {/* Outline strokes */}
          <Path
            d="M8 5.55664C8 4.49577 8.42143 3.47836 9.17157 2.72821C9.92172 1.97807 10.9391 1.55664 12 1.55664C13.0609 1.55664 14.0783 1.97807 14.8284 2.72821C15.5786 3.47836 16 4.49578 16 5.55664M3 6.4419V20.4419C3 20.9723 3.21071 21.481 3.58579 21.8561C3.96086 22.2312 4.46957 22.4419 5 22.4419H19C19.5304 22.4419 20.0391 22.2312 20.4142 21.8561C20.7893 21.481 21 20.9723 21 20.4419V6.4419H3Z"
            stroke={strokeColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    )
  }

  // @ts-ignore
  if (lucideIcons[name]) {
    // @ts-ignore
    const IconComponent = lucideIcons[name] as any
    const fill = name.includes("filled") ? color : "transparent"
    // const fill = color
    // const fill = undefined

    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <IconComponent style={$imageStyle} size={size} color={color} fill={fill} />
      </View>
    )
  }

  if (TablerIcon.glyphMap[name]) {
    return (
      <View {...viewProps} style={$containerStyleOverride}>
        <TablerIcon style={$textStyle} name={name} size={size} color={color} />
      </View>
    )
  }

  return (
    <View {...viewProps} style={$containerStyleOverride}>
      <Image style={$imageStyle} source={iconRegistry[name]} />
    </View>
  )
}

export const iconRegistry = {
  // included in other font sets (imported automatically):
  // included here mostly for ide/type hinting purposes:
  // Custom SVG icons:
  "home": 1,
  "home-filled": 1,
  "shopping-bag": 1,
  "shopping-bag-filled": 1,
  // tabler icons:
  "settings": 1,
  "bluetooth-connected": 1,
  "bluetooth-off": 1,
  "battery-3": 1,
  "battery-2": 1,
  "battery-1": 1,
  "battery-0": 1,
  "arrow-left": 1,
  "arrow-right": 1,
  "x": 1,
  "message-2-star": 1,
  "shield-lock": 1,
  "user-code": 1,
  "user": 1,
  "user-filled": 1,
  "sun": 1,
  "microphone": 1,
  "device-ipad": 1,
  "device-airpods-case": 1,
  "brightness-half": 1,
  "battery-charging": 1,
  "alert": 1,
  "chevron-left": 1,
  // lucide-react-native icons:
  ...lucideIcons,
}

const $imageStyleBase: ImageStyle = {
  resizeMode: "contain",
}
