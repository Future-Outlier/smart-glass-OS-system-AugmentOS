import React from "react"
import {Alert, Platform} from "react-native"
import BasicDialog from "@/components/ignite/BasicDialog"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {StyleSheet, View} from "react-native"
import {useAppTheme} from "./useAppTheme"
import {BackHandler} from "react-native"
import {SettingsNavigationUtils} from "./SettingsNavigationUtils"
import {StatusBar} from "expo-status-bar"
import * as NavigationBar from "expo-navigation-bar"

// Type for button style options
type ButtonStyle = "default" | "cancel" | "destructive"

// Button interface aligned with MessageModal
interface ModalButton {
  text: string
  onPress?: () => void
  style?: ButtonStyle
}

// Global state to manage the modal
let modalRef: {
  showModal: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: {
      isDarkTheme?: boolean
      iconName?: string
      iconSize?: number
      iconColor?: string
      icon?: React.ReactNode
    },
  ) => void
} | null = null

// Function to register the modal reference
export const setModalRef = (ref: typeof modalRef) => {
  modalRef = ref
}

// Converts a React Native AlertButton to our ModalButton format
const convertToModalButton = (button: AlertButton, index: number, totalButtons: number): ModalButton => {
  let style: ButtonStyle = "default"

  // Heuristics to determine button style based on text and position
  if (button.style === "cancel" || button.style === "destructive") {
    // Use RN's native styles if provided
    style = button.style
  } else if (button.text && ["cancel", "no", "back"].includes(button.text.toLowerCase())) {
    style = "cancel"
  } else if (button.text && ["delete", "remove", "destroy"].includes(button.text.toLowerCase())) {
    style = "destructive"
  } else if (index === totalButtons - 1) {
    // Last button is usually confirm/primary
    style = "default"
  }

  return {
    text: button.text || "",
    onPress: button.onPress,
    style,
  }
}

// Global component that will be rendered once at the app root
export function ModalProvider({children}: {children: React.ReactNode}) {
  const {theme} = useAppTheme()
  const [visible, setVisible] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [buttons, setButtons] = React.useState<ModalButton[]>([])
  const [options, setOptions] = React.useState<{
    iconName?: string
    iconSize?: number
    iconColor?: string
    icon?: React.ReactNode
  }>({})
  const [originalNavBarColor, setOriginalNavBarColor] = React.useState<string | null>(null)

  React.useEffect(() => {
    const backHandler = () => {
      if (visible) {
        return true // prevent default back behavior
      }
      return false
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", backHandler)

    return () => subscription.remove()
  }, [visible])

  // Handle navigation bar color changes when modal visibility changes
  React.useEffect(() => {
    const updateNavigationBarColor = async () => {
      if (Platform.OS === "android") {
        try {
          if (visible) {
            // Store the original color before changing
            if (!originalNavBarColor) {
              // Get current navigation bar color based on theme
              const currentColor = theme.isDark ? "#090A14" : "#FFFFFF"
              setOriginalNavBarColor(currentColor)
            }
            
            // Set navigation bar to match the dark overlay
            // The modal overlay color is theme.colors.modalOverlay which is semi-transparent
            // We need to use a solid dark color for the navigation bar
            const overlayColor = theme.isDark ? "#000000" : "#1a1a1a"
            await NavigationBar.setBackgroundColorAsync(overlayColor)
            await NavigationBar.setButtonStyleAsync("light")
          } else if (originalNavBarColor) {
            // Restore original navigation bar color
            await NavigationBar.setBackgroundColorAsync(originalNavBarColor)
            await NavigationBar.setButtonStyleAsync(theme.isDark ? "light" : "dark")
            setOriginalNavBarColor(null)
          }
        } catch (error) {
          console.warn("Failed to update navigation bar color for modal:", error)
        }
      }
    }

    updateNavigationBarColor()
  }, [visible, theme, originalNavBarColor])

  React.useEffect(() => {
    // Register the modal functions for global access
    setModalRef({
      showModal: (title, message, alertButtons = [], opts = {}) => {
        setTitle(title)
        setMessage(message)

        // Convert all buttons to our ModalButton format with style hints
        const modalButtons =
          alertButtons.length > 0
            ? alertButtons.map((btn, idx) => convertToModalButton(btn, idx, alertButtons.length))
            : [{text: "OK"}]

        setButtons(modalButtons)

        // Set options with fallback to component's props
        setOptions({
          iconName: opts.iconName,
          iconSize: opts.iconSize,
          iconColor: opts.iconColor,
          icon: opts.icon,
        })

        setVisible(true)
      },
    })

    return () => {
      setModalRef(null)
    }
  }, [])

  const handleDismiss = () => {
    setVisible(false)
  }

  return (
    <>
      {children}
      {visible && (
        <>
          <StatusBar style="light" />
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              zIndex: 10,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: theme.colors.modalOverlay,
              paddingHorizontal: 24,
            }}>
            <View
              style={{
                width: "100%",
                maxWidth: 400,
              }}>
              <BasicDialog
                title={title}
                description={message}
                icon={
                  options.icon ??
                  (options.iconName ? (
                    <Icon name={options.iconName} size={options.iconSize ?? 24} color={options.iconColor} />
                  ) : undefined)
                }
                leftButtonText={buttons.length > 1 ? buttons[0].text : undefined}
                onLeftPress={
                  buttons.length > 1
                    ? () => {
                        buttons[0].onPress?.()
                        setVisible(false)
                      }
                    : undefined
                }
                rightButtonText={buttons.length > 1 ? buttons[1].text : buttons[0].text}
                onRightPress={() => {
                  if (buttons.length > 1) {
                    buttons[1].onPress?.()
                  } else {
                    buttons[0].onPress?.()
                  }
                  setVisible(false)
                }}
              />
            </View>
          </View>
        </>
      )}
    </>
  )
}

export interface AlertButton {
  text: string
  onPress?: () => void
  style?: "default" | "cancel" | "destructive"
}

export interface AlertOptions {
  cancelable?: boolean
  iconName?: string
  iconColor?: string
  iconSize?: number
}

export interface ConnectivityAlertOptions extends AlertOptions {
  requirement?: "bluetooth" | "location" | "locationServices" | "permissions"
  showTurnOnButton?: boolean
  turnOnButtonText?: string
}

/**
 * Shows a standard alert with custom buttons
 */
const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[],
  options?: AlertOptions,
) => {
  if (modalRef) {
    modalRef.showModal(title, message, buttons, {
      iconName: options?.iconName,
      iconColor: options?.iconColor,
      iconSize: options?.iconSize,
    })
  } else {
    // Fallback to system alert if modal is not available
    Alert.alert(title, message, buttons, options)
  }
}

/**
 * Shows a connectivity-related alert with a "Turn On" button that opens the appropriate settings
 */
const showConnectivityAlert = (
  title: string,
  message: string,
  requirement: "bluetooth" | "location" | "locationServices" | "permissions",
  options?: ConnectivityAlertOptions,
) => {
  const buttons: AlertButton[] = []

  // Add "Turn On" button if enabled
  if (options?.showTurnOnButton !== false) {
    buttons.push({
      text: options?.turnOnButtonText || "Turn On",
      onPress: () => {
        SettingsNavigationUtils.openSettingsForRequirement(requirement)
      },
    })
  }

  // Add "Cancel" button
  buttons.push({
    text: "Cancel",
    style: "cancel",
  })

  showAlert(title, message, buttons, options)
}

/**
 * Shows a Bluetooth-related alert with a "Turn On Bluetooth" button
 * Uses the new modal system with BasicDialog for consistent design
 */
const showBluetoothAlert = (
  title: string,
  message: string,
  options?: ConnectivityAlertOptions,
) => {
  if (modalRef) {
    const buttons: AlertButton[] = []

    // Add "Cancel" button first (left side)
    buttons.push({
      text: "Cancel",
      style: "cancel",
    })

    // Add "Turn On" button second (right side)
    if (options?.showTurnOnButton !== false) {
      buttons.push({
        text: options?.turnOnButtonText || "Turn On Bluetooth",
        onPress: () => {
          SettingsNavigationUtils.openSettingsForRequirement("bluetooth")
        },
      })
    }

    modalRef.showModal(title, message, buttons, {
      iconName: "bluetooth",
      iconColor: "#007AFF",
      iconSize: 32,
      ...options,
    })
  } else {
    // Fallback to old alert system if modal is not available
    showConnectivityAlert(title, message, "bluetooth", {
      turnOnButtonText: "Turn On Bluetooth",
      ...options,
    })
  }
}

/**
 * Shows a Location-related alert with a "Turn On Location" button
 * Uses the new modal system with BasicDialog for consistent design
 */
const showLocationAlert = (
  title: string,
  message: string,
  options?: ConnectivityAlertOptions,
) => {
  if (modalRef) {
    const buttons: AlertButton[] = []

    // Add "Turn On" button if enabled
    if (options?.showTurnOnButton !== false) {
      buttons.push({
        text: options?.turnOnButtonText || "Turn On Location",
        onPress: () => {
          SettingsNavigationUtils.openSettingsForRequirement("location")
        },
      })
    }

    // Add "Cancel" button
    buttons.push({
      text: "Cancel",
      style: "cancel",
    })

    modalRef.showModal(title, message, buttons, {
      iconName: "map-marker",
      iconColor: "#34C759",
      iconSize: 32,
      ...options,
    })
  } else {
    // Fallback to old alert system if modal is not available
    showConnectivityAlert(title, message, "location", {
      turnOnButtonText: "Turn On Location",
      ...options,
    })
  }
}

/**
 * Shows a Location Services alert with a "Turn On Location Services" button
 * Uses Google Play Services dialog on Android for better UX
 */
const showLocationServicesAlert = (
  title: string,
  message: string,
  options?: ConnectivityAlertOptions,
) => {
  // Show the location services dialog directly for better UX
  SettingsNavigationUtils.showLocationServicesDialog().catch((error) => {
    console.error("Error showing location services dialog:", error)
    // Fallback to regular alert if dialog fails
    showConnectivityAlert(title, message, "locationServices", {
      turnOnButtonText: "Turn On Location Services",
      ...options,
    })
  })
}

/**
 * Shows a Permissions alert with a "Open Settings" button
 * Uses the new modal system with BasicDialog for consistent design
 */
const showPermissionsAlert = (
  title: string,
  message: string,
  options?: ConnectivityAlertOptions,
) => {
  if (modalRef) {
    const buttons: AlertButton[] = []

    // Add "Turn On" button if enabled
    if (options?.showTurnOnButton !== false) {
      buttons.push({
        text: options?.turnOnButtonText || "Open Settings",
        onPress: () => {
          SettingsNavigationUtils.openSettingsForRequirement("permissions")
        },
      })
    }

    // Add "Cancel" button
    buttons.push({
      text: "Cancel",
      style: "cancel",
    })

    modalRef.showModal(title, message, buttons, {
      iconName: "shield-check",
      iconColor: "#FF9500",
      iconSize: 32,
      ...options,
    })
  } else {
    // Fallback to old alert system if modal is not available
    showConnectivityAlert(title, message, "permissions", {
      turnOnButtonText: "Open Settings",
      ...options,
    })
  }
}

/**
 * Shows a destructive action alert with proper styling
 * Uses the new modal system with BasicDialog for consistent design
 */
const showDestructiveAlert = (
  title: string,
  message: string,
  buttons: AlertButton[],
  options?: AlertOptions,
) => {
  if (modalRef) {
    modalRef.showModal(title, message, buttons, {
      iconName: "delete-forever",
      iconColor: "#FF3B30",
      iconSize: 32,
      ...options,
    })
  } else {
    // Fallback to old alert system if modal is not available
    showAlert(title, message, buttons, options)
  }
}

export {
  showAlert,
  showConnectivityAlert,
  showBluetoothAlert,
  showLocationAlert,
  showLocationServicesAlert,
  showPermissionsAlert,
  showDestructiveAlert,
}

export default showAlert
