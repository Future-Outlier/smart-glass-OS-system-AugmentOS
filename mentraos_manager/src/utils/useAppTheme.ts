import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react"
import {Platform, StyleProp, useColorScheme} from "react-native"
import {DarkTheme, DefaultTheme, useTheme as useNavTheme} from "@react-navigation/native"
import {type Theme, type ThemeContexts, type ThemedStyle, type ThemedStyleArray, lightTheme, darkTheme} from "@/theme"
import * as SystemUI from "expo-system-ui"
import * as NavigationBar from "expo-navigation-bar"
import {loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"

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

const themeContextToTheme = (themeContext: ThemeContexts): Theme => (themeContext === "dark" ? darkTheme : lightTheme)

const setImperativeTheming = async (theme: Theme) => {
  SystemUI.setBackgroundColorAsync(theme.colors.background)
  
  // Set navigation bar color for Android
  if (Platform.OS === "android") {
    try {
      // For dark theme, use the darker start of the gradient to better match the tab bar appearance
      // For light theme, use the same blue-tinted white as the tab bar
      const navBarColor = theme.isDark ? "#090A14" : "#F8FAFF"
      await NavigationBar.setBackgroundColorAsync(navBarColor)
      
      // Set button colors based on theme
      await NavigationBar.setButtonStyleAsync(theme.isDark ? "light" : "dark")
    } catch (error) {
      console.warn("Failed to set navigation bar color:", error)
    }
  }
}

export type ThemeType = "light" | "dark" | "system"

export const useThemeProvider = (initialTheme: ThemeContexts = undefined) => {
  const colorScheme = useColorScheme()
  const [overrideTheme, setTheme] = useState<ThemeContexts>(initialTheme)
  const [isLoaded, setIsLoaded] = useState(false)

  const setThemeContextOverride = useCallback((newTheme: ThemeContexts) => {
    setTheme(newTheme)
  }, [])

  // Load saved theme preference on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = (await loadSetting(SETTINGS_KEYS.THEME_PREFERENCE, "system")) as ThemeType
        if (savedTheme === "system") {
          setTheme(undefined)
        } else {
          setTheme(savedTheme)
        }
      } catch (error) {
        console.error("Error loading theme preference:", error)
      } finally {
        setIsLoaded(true)
      }
    }

    loadThemePreference()
  }, [])

  const themeScheme = overrideTheme || colorScheme || "light"
  const navigationTheme = themeScheme === "dark" ? DarkTheme : DefaultTheme

  useEffect(() => {
    if (isLoaded) {
      setImperativeTheming(themeContextToTheme(themeScheme))
    }
  }, [themeScheme, isLoaded])

  return {
    themeScheme,
    navigationTheme,
    setThemeContextOverride,
    ThemeProvider: ThemeContext.Provider,
  }
}

interface UseAppThemeValue {
  // The theme object from react-navigation
  navTheme: typeof DefaultTheme
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
  const navTheme = useNavTheme()
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  const {themeScheme: overrideTheme, setThemeContextOverride} = context

  const themeContext: ThemeContexts = useMemo(
    () => overrideTheme || (navTheme.dark ? "dark" : "light"),
    [overrideTheme, navTheme],
  )

  const themeVariant: Theme = useMemo(() => themeContextToTheme(themeContext), [themeContext])

  // Update navigation bar color when theme changes
  useEffect(() => {
    setImperativeTheming(themeVariant)
  }, [themeVariant])

  const themed = useCallback(
    <T>(styleOrStyleFn: ThemedStyle<T> | StyleProp<T> | ThemedStyleArray<T>) => {
      const flatStyles = [styleOrStyleFn].flat(3)
      const stylesArray = flatStyles.map(f => {
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
    navTheme,
    setThemeContextOverride,
    theme: themeVariant,
    themeContext,
    themed,
  }
}
