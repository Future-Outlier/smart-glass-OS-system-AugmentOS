import {TextStyle, ScrollView} from "react-native"

import {Screen, Header} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {type ThemeType} from "@/contexts/ThemeContext"
import {SETTINGS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {translate} from "@/i18n"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {OptionList} from "@/components/ui/Options"

export default function AppearanceSettingsPage() {
  const {goBack} = useNavigationHistory()

  const [themePreference, setThemePreference] = useSetting(SETTINGS.theme_preference.key)
  const [iosGlassEffect, setIosGlassEffect] = useSetting(SETTINGS.ios_glass_effect.key)

  const handleThemeChange = async (newTheme: ThemeType) => {
    await setThemePreference(newTheme)
  }

  return (
    <Screen preset="fixed">
      <Header title={translate("settings:appearance")} leftIcon="chevron-left" onLeftPress={() => goBack()} />
      <ScrollView className="pt-6" contentContainerClassName="gap-6">
        <OptionList
          title={translate("appearanceSettings:theme")}
          selected={themePreference}
          onSelect={handleThemeChange}
          options={[
            {key: "light", label: translate("appearanceSettings:lightTheme")},
            {key: "dark", label: translate("appearanceSettings:darkTheme")},
            {key: "system", label: translate("appearanceSettings:systemDefault")},
          ]}
        />

        <Group>
          <ToggleSetting
            label={translate("appearanceSettings:liquidGlassEffect")}
            onValueChange={(value) => setIosGlassEffect(value)}
            value={iosGlassEffect}
          />
        </Group>
      </ScrollView>
    </Screen>
  )
}

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.s3,
})
