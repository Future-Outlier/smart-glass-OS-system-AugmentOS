import {DarkTheme, DefaultTheme, useTheme as _useNavTheme} from "@react-navigation/native"
import * as SystemUI from "expo-system-ui"
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react"
import {Appearance, ColorSchemeName, Platform, StyleProp, useColorScheme} from "react-native"
import {Uniwind} from "uniwind"
import * as NavigationBar from "expo-navigation-bar"

import {useSetting, SETTINGS} from "@/stores/settings"
import {type Theme, type ThemeContexts, type ThemedStyle, type ThemedStyleArray, lightTheme, darkTheme} from "@/theme"
import {setStatusBarStyle} from "expo-status-bar"

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

const setImperativeTheming = async (theme: Theme) => {
  setStatusBarStyle(theme.isDark ? "light" : "dark")
  // this is the color of the navigation bar on android and so it should be the end of the gradient:
  // on ios it doesn't matter much other than for transitional screens and should be the same as the background
  if (Platform.OS === "ios") {
    SystemUI.setBackgroundColorAsync(theme.colors.background)
  } else {
    SystemUI.setBackgroundColorAsync(theme.colors.backgroundStart)
    NavigationBar.setButtonStyleAsync(theme.isDark ? "light" : "dark")
  }
}

export type ThemeType = "light" | "dark" | "system"

export const useThemeProvider = (initialTheme: ThemeContexts = undefined) => {
  const colorScheme = useColorScheme()
  const [overrideTheme, setTheme] = useState<ThemeContexts>(initialTheme)
  const [savedTheme, _setSavedTheme] = useSetting(SETTINGS.theme_preference.key)
  const [originalNavBarColor, setOriginalNavBarColor] = useState<string | null>(null)
  const hasLoaded = useRef(false)

  const setThemeContextOverride = useCallback((newTheme: ThemeContexts) => {
    setTheme(newTheme)
  }, [])

  // Load saved theme preference on mount
  // useEffect(() => {
  //   const loadThemePreference = async () => {
  //     console.log("loadThemePreference", savedTheme, colorScheme)

  //     if (savedTheme !== "system") {
  //       // setStatusBarStyle(savedTheme === "dark" ? "light" : "dark")
  //       console.log("setStatusBarStyle", savedTheme)
  //       setStatusBarStyle(savedTheme === "dark" ? "light" : "dark", true)
  //       setTheme(savedTheme)
  //       try {
  //         // Uniwind.setTheme(savedTheme)
  //       } catch (error) {
  //         console.error("Error loading theme preference:", error)
  //       }
  //     } else {
  //       let themeType: "light" | "dark" = colorScheme === "dark" ? "dark" : "light"
  //       try {
  //         setTimeout(() => {
  //           console.log("setStatusBarStyle", themeType)
  //           setStatusBarStyle(themeType === "dark" ? "light" : "dark", true)
  //         }, 1000)
  //       } catch (error) {
  //         console.error("Error loading theme preference:", error)
  //       }
  //       try {
  //         // Uniwind.setTheme(themeType)
  //       } catch (error) {
  //         console.error("Error loading theme preference:", error)
  //       }
  //       setTheme(themeType)
  //     }

  //     setTimeout(() => {
  //       console.log("setHasLoaded", hasLoaded.current)
  //       hasLoaded.current = true
  //     }, 1000)
  //     // get if the system is dark or light
  //     // const isDark = Appearance.getColorScheme() === "dark"
  //     // if (!isDark && colorScheme === "unspecified") {
  //     //   // do nothing
  //     // } else {
  //     //   setTheme(isDark ? "dark" : "light")
  //     // }

  //     // if (colorScheme !== "unspecified") {
  //     //   setTheme(colorScheme === "dark" ? "dark" : "light")
  //     // } else {
  //     //   setTheme(savedTheme)
  //     // }
  //     // Uniwind.setTheme(savedTheme)
  //   }

  //   loadThemePreference()
  // }, [])

  useEffect(() => {
    console.log("useEffect", colorScheme)
    if (!hasLoaded.current) {
      return
    }

    const onColorSchemeChanged = async () => {
      console.log("onColorSchemeChanged", colorScheme)

      setTheme(colorScheme === "dark" ? "dark" : "light")

      if (savedTheme !== "system") {
        return
      }

      let themeType: "light" | "dark" = colorScheme === "dark" ? "dark" : "light"
    }
    onColorSchemeChanged()
  }, [colorScheme])


  // useEffect(() => {
  //   if (!hasLoaded.current) {
  //     return
  //   }

  //   if (savedTheme !== "system") {
  //     setStatusBarStyle(savedTheme === "dark" ? "light" : "dark", true)
  //     setTheme(savedTheme)
  //     Uniwind.setTheme(savedTheme)
  //     return
  //   }

  //   let scheme = Appearance.getColorScheme()
  //   let themeType: "light" | "dark" = scheme === "dark" ? "dark" : "light"
  //   setStatusBarStyle(themeType === "dark" ? "light" : "dark", true)
  //   setTheme(themeType)
  //   Uniwind.setTheme(themeType)
  // }, [savedTheme])

  const themeScheme: ColorSchemeName = overrideTheme || colorScheme || "light"
  const navigationTheme = themeScheme === "dark" ? DarkTheme : DefaultTheme

  // useEffect(() => {
  //   if (isLoaded) {
  //     setImperativeTheming(themeNameToTheme(themeScheme))
  //   }
  // }, [themeScheme, isLoaded, colorScheme])

  // Handle navigation bar color changes when modal visibility changes
  // useEffect(() => {
  //   const updateNavigationBarColor = async () => {
  //     const isDark = colorScheme == "dark" || savedTheme === "dark"
  //     if (Platform.OS === "android") {
  //       try {
  //         console.log("updateNavigationBarColor", isDark)
  //         NavigationBar.setStyle(isDark ? "dark" : "light")
  //         // Store the original color before changing
  //         // if (!originalNavBarColor) {
  //         //   // Get current navigation bar color based on theme
  //         //   const currentColor = isDark ? "#090A14" : "#FFFFFF"
  //         //   setOriginalNavBarColor(currentColor)
  //         // }
  //         // Restore original navigation bar color
  //         // await NavigationBar.setBackgroundColorAsync(originalNavBarColor ?? "")
  //         // await NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark")
  //         // setOriginalNavBarColor(null)
  //       } catch (error) {
  //         console.warn("Failed to update navigation bar color for modal:", error)
  //       }
  //     }
  //   }

  //   updateNavigationBarColor()
  // }, [savedTheme, colorScheme])

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
