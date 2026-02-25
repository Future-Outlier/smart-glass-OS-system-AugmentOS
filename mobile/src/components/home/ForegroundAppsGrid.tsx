import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {Dimensions, Pressable, StyleSheet, TouchableOpacity, View} from "react-native"
import {DraggableMasonryList} from "react-native-draggable-masonry"
import {BlurView} from "expo-blur"

import {Icon, Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {useAppTheme} from "@/contexts/ThemeContext"
import {
  ClientAppletInterface,
  DUMMY_APPLET,
  getPackageNamePriority,
  useForegroundApps,
  useStartApplet,
} from "@/stores/applets"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {SETTINGS, useSetting} from "@/stores/settings"
import {storage} from "@/utils/storage"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

const GRID_COLUMNS = 4
const APP_ORDER_KEY = "foreground_apps_order"
const POPOVER_WIDTH = 180
const SCREEN_PADDING = 12

type MasonryAppItem = ClientAppletInterface & {id: string; height: number}
type OrderMap = Record<string, number>

interface PopoverAction {
  label: string
  icon: string
  destructive?: boolean
  onPress: () => void
}

interface PopoverPosition {
  x: number
  y: number
}

const AppPopover: React.FC<{
  visible: boolean
  position: PopoverPosition
  actions: PopoverAction[]
  onClose: () => void
}> = ({visible, position, actions, onClose}) => {
  const {theme} = useAppTheme()
  const {width: screenWidth, height: screenHeight} = Dimensions.get("window")

  if (!visible) return null

  // const popoverHeight = actions.length * 44 + 16
  let left = position.x
  let top = position.y + 110
  // let left = position.x - POPOVER_WIDTH / 2
  // let top = position.y
  // if (left < SCREEN_PADDING) left = SCREEN_PADDING
  if (left + POPOVER_WIDTH > screenWidth - SCREEN_PADDING) {
    left = screenWidth - SCREEN_PADDING - POPOVER_WIDTH
  }
  // const showAbove = top + popoverHeight > screenHeight - 40
  // if (showAbove) {
  //   top = position.y - popoverHeight - 8
  // }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View
          style={{
            position: "absolute",
            left: left,
            top: top,
            width: POPOVER_WIDTH,
          }}>
          <BlurView intensity={80} tint="default" className="rounded-2xl overflow-hidden">
            <View className="py-1">
              {actions.map((action, index) => (
                <View key={action.label}>
                  <Pressable
                    className="flex-row items-center gap-3 px-4 py-3 active:bg-foreground/10"
                    onPress={() => {
                      onClose()
                      action.onPress()
                    }}>
                    <Icon
                      name={action.icon as any}
                      size={24}
                      color={action.destructive ? theme.colors.destructive : theme.colors.foreground}
                    />
                    <Text
                      className={`text-[15px] ${action.destructive ? "text-destructive" : "text-foreground"}`}
                      text={action.label}
                    />
                  </Pressable>
                  {index < actions.length - 1 && <View className="h-px bg-white/10 mx-4" />}
                </View>
              ))}
            </View>
          </BlurView>
        </View>
      </Pressable>
    </View>
  )
}

export const ForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()

  const startApplet = useStartApplet()
  const [appSwitcherUi] = useSetting(SETTINGS.app_switcher_ui.key)
  const apps = useForegroundApps()

  const [orderMap, setOrderMap] = useState<OrderMap | null>(null)
  const [popoverVisible, setPopoverVisible] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({x: 0, y: 0})
  const [selectedApp, setSelectedApp] = useState<ClientAppletInterface | null>(null)
  const {push} = useNavigationHistory()

  const containerRef = useRef<View>(null)
  const isMovingRef = useRef(false)
  const draggingIndexRef = useRef(0)

  useEffect(() => {
    const result = storage.load<OrderMap>(APP_ORDER_KEY)
    if (result.is_ok()) {
      setOrderMap(result.value)
    }
  }, [])

  const gridData: MasonryAppItem[] = useMemo(() => {
    let filteredApps = apps.filter((app) => {
      if (app.running && !appSwitcherUi) return false
      if (!app.compatibility?.isCompatible) return false
      return true
    })

    if (orderMap) {
      filteredApps.sort((a, b) => {
        const aIndex = orderMap[a.packageName]
        const bIndex = orderMap[b.packageName]
        if (aIndex === undefined && bIndex === undefined) {
          return getPackageNamePriority(a, b)
        }
        if (aIndex === undefined) return 1
        if (bIndex === undefined) return -1
        return aIndex - bIndex
      })
    } else {
      filteredApps.sort(getPackageNamePriority)
    }

    const totalItems = filteredApps.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = GRID_COLUMNS + remainder
    for (let i = 0; i < emptySlots; i++) {
      filteredApps.push({...DUMMY_APPLET, packageName: `__empty_${filteredApps.length}`})
    }

    return filteredApps.map((app) => ({
      ...app,
      id: app.packageName,
      height: 110,
    }))
  }, [apps, appSwitcherUi, orderMap])

  const dismissPopover = useCallback(() => {
    setPopoverVisible(false)
    setSelectedApp(null)
  }, [])

  const popoverActions: PopoverAction[] = useMemo(
    () => [
      {
        label: "Open",
        icon: "external-link",
        onPress: () => {
          if (selectedApp) startApplet(selectedApp.packageName)
        },
      },
      {
        label: "Settings",
        icon: "cog",
        onPress: () => {
          push("/applet/settings", {
            packageName: selectedApp?.packageName,
            appName: selectedApp?.name,
          })
        },
      },
      {
        label: "Remove",
        icon: "minus",
        onPress: () => {
          // TODO: remove from grid
        },
      },
      {
        label: "Uninstall",
        icon: "trash",
        destructive: true,
        onPress: () => {
          // TODO: uninstall app
        },
      },
    ],
    [selectedApp, startApplet],
  )

  const handlePress = async (app: ClientAppletInterface) => {
    const result = await askPermissionsUI(app, theme)
    if (result !== 1) return
    startApplet(app.packageName)
  }

  const showPopover = useCallback(
    (key: string, ref?: View | null) => {
      const app = gridData.find((a) => a.packageName === key)
      // get the index of the app
      const index = gridData.findIndex((a) => a.packageName === key)
      if (!app?.name) return

      setSelectedApp(app)

      // if (ref) {
      //   ref.measureInWindow((x, y, width, height) => {
      //     setPopoverPosition({
      //       x: x + width / 2,
      //       y: y + height + 8,
      //     })
      //     setPopoverVisible(true)
      //   })
      // } else {
      //   const {width} = Dimensions.get("window")
      //   setPopoverPosition({x: width / 2, y: 300})
      //   setPopoverVisible(true)
      // }

      if (ref) {
        ref.measureLayout(
          containerRef.current as any,
          (x, y, width, height) => {
            // console.log("x", x, "y", y, "width", width, "height", height)
            setPopoverPosition({x, y})
            setPopoverVisible(true)
          },
          () => console.warn("measureLayout failed"),
        )
      } else {
        // fallback to center of screen:
        const {width} = Dimensions.get("window")
        setPopoverPosition({x: width / 2, y: 300})
        setPopoverVisible(true)
      }
    },
    [gridData],
  )

  const handleDragStart = ({key}: {key: string; fromIndex: number}) => {
    isMovingRef.current = false
    // showPopover(key)
    const ref = itemRefs.current[key]
    showPopover(key, ref)
  }

  const handleDragChange = ({key, x, y, index}: {key: string; x: number; y: number; index: number}) => {
    if (!isMovingRef.current) {
      isMovingRef.current = true
      draggingIndexRef.current = index
    }

    if (isMovingRef.current && draggingIndexRef.current !== index) {
      dismissPopover()
    }
  }

  const handleDragEnd = ({data}: {data: MasonryAppItem[]}) => {
    isMovingRef.current = false

    const newOrderMap: OrderMap = {}
    data.forEach((item, index) => {
      newOrderMap[item.packageName] = index
    })
    setOrderMap(newOrderMap)
    storage.save(APP_ORDER_KEY, newOrderMap)
  }

  const itemRefs = useRef<Record<string, View | null>>({})

  const renderItem = useCallback(
    ({item}: {item: MasonryAppItem}) => {
      return (
        <TouchableOpacity
          ref={(ref) => {
            itemRefs.current[item.packageName] = ref
          }}
          className="flex-1 items-center justify-center pt-3"
          onPress={() => handlePress(item)}
          activeOpacity={0.7}>
          {/* <View className="bg-blue-500 h-4 w-full z-10 flex-1" /> */}
          <AppIcon app={item} className="w-16 h-16" />
          <View className="w-full h-9 my-1 items-center justify-start">
            <Text
              className="text-secondary-foreground text-center mt-1 text-[12px] shrink"
              numberOfLines={2}
              ellipsizeMode="tail"
              text={item.name}
            />
          </View>
          {/* <View className="bg-blue-500 h-4 w-full z-10 flex-1" /> */}
        </TouchableOpacity>
      )
    },
    [themed, theme, startApplet],
  )

  return (
    <View className="flex-1 mt-3">
      {!appSwitcherUi && (
        <View className="flex-row justify-between items-center pb-3">
          <Text tx="home:inactiveApps" className="font-semibold text-xl text-secondary-foreground" />
        </View>
      )}
      <View ref={containerRef}>
        <DraggableMasonryList
          data={gridData}
          renderItem={renderItem}
          columns={GRID_COLUMNS}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragChange={handleDragChange}
          overDrag="none"
          showDropIndicator={true}
          dropIndicatorStyle={{backgroundColor: theme.colors.primary_foreground, borderWidth: 0}}
        />
      </View>
      <AppPopover
        visible={popoverVisible}
        position={popoverPosition}
        actions={popoverActions}
        onClose={dismissPopover}
      />
    </View>
  )
}
