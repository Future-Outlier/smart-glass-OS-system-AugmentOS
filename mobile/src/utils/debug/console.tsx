import {useState, useEffect, useRef} from "react"
import {ScrollView, TouchableOpacity, View, PanResponder, Animated, ViewStyle, TextStyle} from "react-native"
import {Text} from "@/components/ignite/Text"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export const ConsoleLogger = () => {
  const {themed} = useAppTheme()
  const [logs, setLogs] = useState([])
  const [isVisible, setIsVisible] = useState(true)
  const scrollViewRef = useRef(null)
  const [debugConsole] = useSetting(SETTINGS_KEYS.debug_console)

  const pan = useRef(new Animated.ValueXY({x: 0, y: 50})).current
  const toggleButtonPan = useRef(new Animated.ValueXY({x: 0, y: 0})).current

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value,
        })
        pan.setValue({x: 0, y: 0})
      },
      onPanResponderMove: Animated.event([null, {dx: pan.x, dy: pan.y}], {useNativeDriver: false}),
      onPanResponderRelease: () => {
        pan.flattenOffset()
      },
    }),
  ).current

  const toggleButtonPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        toggleButtonPan.setOffset({
          x: toggleButtonPan.x._value,
          y: toggleButtonPan.y._value,
        })
        toggleButtonPan.setValue({x: 0, y: 0})
      },
      onPanResponderMove: Animated.event([null, {dx: toggleButtonPan.x, dy: toggleButtonPan.y}], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        toggleButtonPan.flattenOffset()
      },
    }),
  ).current

  useEffect(() => {
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    const addLog = (type, args) => {
      const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ")

      setLogs(prev => {
        const newLogs = [
          ...prev,
          {
            type,
            message,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]
        return newLogs.slice(-500)
      })
    }

    console.log = (...args) => {
      addLog("log", args)
      originalLog(...args)
    }

    console.warn = (...args) => {
      addLog("warn", args)
      originalWarn(...args)
    }

    console.error = (...args) => {
      addLog("error", args)
      originalError(...args)
    }

    return () => {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [])

  if (!debugConsole) {
    return null
  }

  if (!isVisible) {
    return (
      <Animated.View
        style={[
          themed($toggleButton),
          {
            transform: [{translateX: toggleButtonPan.x}, {translateY: toggleButtonPan.y}],
          },
        ]}
        {...toggleButtonPanResponder.panHandlers}>
        <TouchableOpacity onPress={() => setIsVisible(true)}>
          <Text text="Show Console" style={themed($toggleButtonText)} />
        </TouchableOpacity>
      </Animated.View>
    )
  }

  return (
    <Animated.View
      style={[
        themed($container),
        {
          transform: [{translateX: pan.x}, {translateY: pan.y}],
        },
      ]}>
      <View style={themed($header)} {...panResponder.panHandlers}>
        <Text text={`Console (${logs.length}/500) - Drag to move`} style={themed($headerText)} />
        <View style={themed($headerButtons)}>
          <TouchableOpacity style={themed($clearButton)} onPress={() => setLogs([])}>
            <Text text="Clear" style={themed($buttonText)} />
          </TouchableOpacity>
          <TouchableOpacity style={themed($hideButton)} onPress={() => setIsVisible(false)}>
            <Text text="Hide" style={themed($buttonText)} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        ref={scrollViewRef}
        style={themed($logContainer)}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd()}>
        {logs.map((log, index) => (
          <View key={index} style={themed($logEntry)}>
            <Text text={log.timestamp} style={themed($timestamp)} />
            <Text
              text={log.message}
              style={[
                themed($logText),
                log.type === "error" && themed($errorText),
                log.type === "warn" && themed($warnText),
              ]}
            />
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  position: "absolute",
  left: 0,
  right: 0,
  height: 250,
  backgroundColor: colors.palette.black,
  borderWidth: 2,
  borderColor: colors.border,
  borderRadius: spacing.xs,
})

const $header: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  padding: spacing.xs,
  backgroundColor: colors.palette.neutral100,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
})

const $headerText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.text,
  fontSize: spacing.sm,
  fontWeight: "bold",
})

const $headerButtons: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 8,
})

const $clearButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.neutral400,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
  borderRadius: spacing.xxs,
})

const $hideButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.neutral400,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
  borderRadius: spacing.xxs,
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 12,
})

const $logContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.sm,
})

const $logEntry: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.xxs,
})

const $timestamp: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  fontSize: 10,
  fontFamily: "monospace",
})

const $logText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.success,
  fontFamily: "monospace",
  fontSize: 11,
})

const $errorText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.error,
})

const $warnText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.warning,
})

const $toggleButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  bottom: 20,
  right: 20,
  backgroundColor: colors.palette.neutral100,
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
})

const $toggleButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 12,
  fontWeight: "bold",
})
