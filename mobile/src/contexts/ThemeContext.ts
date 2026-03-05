import {DarkTheme, DefaultTheme, useTheme as _useNavTheme} from "@react-navigation/native"
import * as SystemUI from "expo-system-ui"
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react"
import {Appearance, ColorSchemeName, Platform, StyleProp, useColorScheme} from "react-native"
import * as NavigationBar from "expo-navigation-bar"

import {useSetting, SETTINGS} from "@/stores/settings"
import {type Theme, type ThemeContexts, type ThemedStyle, type ThemedStyleArray, lightTheme, darkTheme} from "@/theme"
import {setStatusBarStyle} from "expo-status-bar"
import {BackgroundTimer} from "@/utils/timers"
import {Uniwind} from "uniwind"

type ThemeContextType = {
  themeScheme: ThemeContexts
  setThemeContextOverride: (newTheme: ThemeContexts) => void
}

// create a React context and provider for the current theme
export const ThemeContext = createContext<ThemeContextType>({
  themeScheme: undefined, // default to the system theme
  setThemeContextOverride: (_newTheme: ThemeContexts) => {
    console.error("Tried to call setThemeContextOverride before the ThemeProvider was initialized")
  },
})

const themeNameToTheme = (name: ColorSchemeName): Theme => (name === "dark" ? darkTheme : lightTheme)

export type ThemeType = "light" | "dark" | "system"

export const useThemeProvider = (initialTheme: ThemeContexts = undefined) => {
  const colorScheme = useColorScheme()
  const [overrideTheme, setTheme] = useState<ThemeContexts>(initialTheme)
  const [savedTheme] = useSetting(SETTINGS.theme_preference.key)
  // const [originalNavBarColor, setOriginalNavBarColor] = useState<string | null>(null)
  const hasLoaded = useRef(false)

  const setThemeContextOverride = useCallback((newTheme: ThemeContexts) => {
    setTheme(newTheme)
  }, [])

  const updateThemeType = (lightOrDark: "light" | "dark") => {
    // somehow this helps with getting the status bar style to update:
    BackgroundTimer.setTimeout(() => {
      setStatusBarStyle(lightOrDark === "dark" ? "light" : "dark", true)
      let theme = themeNameToTheme(lightOrDark)
      SystemUI.setBackgroundColorAsync(theme.colors.background)
      NavigationBar.setButtonStyleAsync(lightOrDark === "dark" ? "light" : "dark")
      NavigationBar.setStyle(lightOrDark == "dark" ? "light" : "dark")
    }, 1000)
    setTheme(lightOrDark)
    Uniwind.setTheme(lightOrDark)
  }

  // Load saved theme preference on mount
  useEffect(() => {
    console.log("loadThemePreference", savedTheme, colorScheme)

    if (savedTheme !== "system") {
      updateThemeType(savedTheme)
    } else {
      let themeType: "light" | "dark" = colorScheme === "dark" ? "dark" : "light"
      updateThemeType(themeType)
    }

    BackgroundTimer.setTimeout(() => {
      hasLoaded.current = true
    }, 1000)
  }, [])

  useEffect(() => {
    console.log("colorScheme changed", colorScheme)
    if (!hasLoaded.current) {
      return
    }

    if (savedTheme !== "system") {
      updateThemeType(savedTheme)
      return
    }

    let themeType: "light" | "dark" = colorScheme === "dark" ? "dark" : "light"
    updateThemeType(themeType)
  }, [colorScheme])

  // react to the setting being changed:
  useEffect(() => {
    if (!hasLoaded.current) {
      return
    }

    if (savedTheme !== "system") {
      updateThemeType(savedTheme)
      return
    }

    let scheme = Appearance.getColorScheme()
    let themeType: "light" | "dark" = scheme === "dark" ? "dark" : "light"
    updateThemeType(themeType)
  }, [savedTheme])

  const themeScheme: ColorSchemeName = overrideTheme || colorScheme || "light"
  const navigationTheme = themeScheme === "dark" ? DarkTheme : DefaultTheme

  return {
    themeScheme,
    navigationTheme,
    setThemeContextOverride,
    ThemeProvider: ThemeContext.Provider,
  }
}

interface UseAppThemeValue {
  // The theme object from react-navigation
  // navTheme: typeof DefaultTheme
  // A function to set the theme context override (for switching modes)
  setThemeContextOverride: (newTheme: ThemeContexts) => void
  // The current theme object
  theme: Theme
  // The current theme context "light" | "dark"
  themeContext: ThemeContexts
  // A function to apply the theme to a style object.
  // See examples in the components directory or read the docs here:
  // https://docs.infinite.red/ignite-cli/boilerplate/app/utils/
  themed: <T>(styleOrStyleFn: ThemedStyle<T> | StyleProp<T> | ThemedStyleArray<T>) => T
}

/**
 * Custom hook that provides the app theme and utility functions for theming.
 *
 * @returns {UseAppThemeReturn} An object containing various theming values and utilities.
 * @throws {Error} If used outside of a ThemeProvider.
 */
export const useAppTheme = (): UseAppThemeValue => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  const {themeScheme: overrideTheme, setThemeContextOverride} = context

  const themeContext: ThemeContexts = useMemo(() => overrideTheme || "dark", [overrideTheme])
  const themeVariant: Theme = useMemo(() => themeNameToTheme(themeContext), [themeContext])

  const themed = useCallback(
    <T>(styleOrStyleFn: ThemedStyle<T> | StyleProp<T> | ThemedStyleArray<T>) => {
      const flatStyles = [styleOrStyleFn].flat(3)
      const stylesArray = flatStyles.map((f) => {
        if (typeof f === "function") {
          return (f as ThemedStyle<T>)(themeVariant)
        } else {
          return f
        }
      })

      // Flatten the array of styles into a single object
      return Object.assign({}, ...stylesArray) as T
    },
    [themeVariant],
  )

  return {
    // navTheme,
    setThemeContextOverride,
    theme: themeVariant,
    themeContext,
    themed,
  }
}
