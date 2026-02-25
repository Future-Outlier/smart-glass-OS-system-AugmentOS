import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {TouchableOpacity, View} from "react-native"
import {DraggableMasonryList} from "react-native-draggable-masonry"

import {Text} from "@/components/ignite"
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
import {MiniAppMoreActionsSheet} from "@/components/miniapps/DualButton"
import {BottomSheetModal} from "@gorhom/bottom-sheet"
import {storage} from "@/utils/storage"

const GRID_COLUMNS = 4
const APP_ORDER_KEY = "foreground_apps_order"

type MasonryAppItem = ClientAppletInterface & {id: string; height: number}
type OrderMap = Record<string, number>

export const ForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()

  const startApplet = useStartApplet()
  const [appSwitcherUi] = useSetting(SETTINGS.app_switcher_ui.key)
  const apps = useForegroundApps()
  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const [packageName, setPackageName] = useState<string | null>(null)
  const [orderMap, setOrderMap] = useState<OrderMap | null>(null)

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
      height: 100,
    }))
  }, [apps, appSwitcherUi, orderMap])

  const handlePress = async (app: ClientAppletInterface) => {
    const result = await askPermissionsUI(app, theme)
    if (result !== 1) return
    startApplet(app.packageName)
  }

  const handleDragStart = ({key}: {key: string; fromIndex: number}) => {
    console.log("handleDragStart", key)
    // dragActiveRef.current = true
    // isMovingRef.current = false

    // Show menu on long-press activation
    const app = gridData.find((a) => a.packageName === key)
    if (app?.name) {
      setPackageName(app.packageName)
      bottomSheetRef.current?.present()
    }
  }

  const handleOrderChange = ({key, fromIndex, toIndex}: {key: string; fromIndex: number; toIndex: number}) => {
    // console.log("handleOrderChange", key, fromIndex, toIndex)
  }

  const handleDragChange = ({key, x, y, index}: {key: string; x: number; y: number; index: number}) => {
    console.log("handleDragChange", key, index)

    if (!isMovingRef.current) {
      isMovingRef.current = true
      draggingIndexRef.current = index
    }

    // if we're already moving, and the index is different from the dragging index, dismiss the menu
    if (isMovingRef.current && draggingIndexRef.current !== index) {
      bottomSheetRef.current?.dismiss()
    }
  }

  const handleDragEnd = ({data}: {data: MasonryAppItem[]}) => {
    isMovingRef.current = false
    // dragActiveRef.current = false

    console.log("handleDragEnd")

    // save to storage:
    const newOrderMap: OrderMap = {}
    data.forEach((item, index) => {
      newOrderMap[item.packageName] = index
    })
    setOrderMap(newOrderMap)
    storage.save(APP_ORDER_KEY, newOrderMap)

    // // Only persist if user actually reordered
    // if (didMoveRef.current) {
    //   const newOrderMap: OrderMap = {}
    //   data.forEach((item, index) => {
    //     newOrderMap[item.packageName] = index
    //   })
    //   setOrderMap(newOrderMap)
    //   storage.save(APP_ORDER_KEY, newOrderMap)
    // }
    // didMoveRef.current = false
  }

  const renderItem = useCallback(
    ({item}: {item: MasonryAppItem}) => {
      return (
        <TouchableOpacity className="items-center py-3" onPress={() => handlePress(item)} activeOpacity={0.7}>
          <AppIcon app={item} className="w-16 h-16" />
          <View className="w-full h-9 my-1 items-center justify-start">
            <Text
              className="text-secondary-foreground text-center mt-1 text-[12px] shrink"
              numberOfLines={2}
              ellipsizeMode="tail"
              text={item.name}
            />
          </View>
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
      <DraggableMasonryList
        data={gridData}
        renderItem={renderItem}
        columns={GRID_COLUMNS}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onOrderChange={handleOrderChange}
        onDragChange={handleDragChange}
        overDrag="none"
      />
      <MiniAppMoreActionsSheet ref={bottomSheetRef} packageName={packageName} />
    </View>
  )
}
