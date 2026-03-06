import {Image} from "expo-image"
import * as ImagePicker from "expo-image-picker"
import {Directory, Paths, File} from "expo-file-system"
import {TouchableOpacity, View} from "react-native"

import {Icon} from "@/components/ignite"
import {Text} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {useAppTheme} from "@/contexts/ThemeContext"
import {SETTINGS, useSetting} from "@/stores/settings"
import {translate} from "@/i18n"

const PRESET_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80",
  "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
  "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80",
  "https://images.unsplash.com/photo-1475274047050-1d0c55b7b10c?w=800&q=80",
]

async function saveBackgroundImage(uri: string): Promise<string> {
  const bgDir = new Directory(Paths.document, "backgrounds")
  if (!bgDir.exists) {
    bgDir.create()
  }
  const filename = `bg_${Date.now()}.jpg`
  const source = new File(uri)
  source.copy(new File(bgDir, filename))
  return new File(bgDir, filename).uri
}

export default function BackgroundPicker() {
  const {theme} = useAppTheme()
  const [background, setBackground] = useSetting<string>(SETTINGS.home_background.key)

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      const savedUri = await saveBackgroundImage(result.assets[0].uri)
      await setBackground(savedUri)
    }
  }

  const selectPreset = async (uri: string) => {
    await setBackground(uri)
  }

  const clearBackground = async () => {
    await setBackground("")
  }

  const isSelected = (uri: string) => background === uri
  const isCustom = background && !PRESET_BACKGROUNDS.includes(background)

  return (
    <Group title={translate("appearanceSettings:homeBackground")}>
      <View className="flex-row flex-wrap gap-3 p-4 bg-card rounded-xl">
        {/* None option */}
        <TouchableOpacity onPress={clearBackground} className="items-center w-[72px]">
          <View
            className={`w-[72px] h-[72px] rounded-lg overflow-hidden items-center justify-center bg-muted ${!background ? "border-[3px]" : ""}`}
            style={!background ? {borderColor: theme.colors.tint} : undefined}>
            <Icon name="x" size={24} color={theme.colors.text} />
          </View>
          <Text className="text-[10px] mt-1 text-center">{translate("appearanceSettings:noBackground")}</Text>
        </TouchableOpacity>

        {/* Presets */}
        {PRESET_BACKGROUNDS.map((uri) => (
          <TouchableOpacity key={uri} onPress={() => selectPreset(uri)} className="items-center w-[72px]">
            <View
              className={`w-[72px] h-[72px] rounded-lg overflow-hidden ${isSelected(uri) ? "border-[3px]" : ""}`}
              style={isSelected(uri) ? {borderColor: theme.colors.tint} : undefined}>
              <Image source={{uri}} style={{width: "100%", height: "100%"}} contentFit="cover" />
            </View>
          </TouchableOpacity>
        ))}

        {/* Pick from library */}
        <TouchableOpacity onPress={pickImage} className="items-center w-[72px]">
          <View
            className={`w-[72px] h-[72px] rounded-lg overflow-hidden items-center justify-center bg-muted ${isCustom ? "border-[3px]" : ""}`}
            style={isCustom ? {borderColor: theme.colors.tint} : undefined}>
            {isCustom ? (
              <Image source={{uri: background}} style={{width: "100%", height: "100%"}} contentFit="cover" />
            ) : (
              <Icon name="plus" size={24} color={theme.colors.text} />
            )}
          </View>
          <Text className="text-[10px] mt-1 text-center">{translate("appearanceSettings:chooseFromLibrary")}</Text>
        </TouchableOpacity>
      </View>
    </Group>
  )
}
