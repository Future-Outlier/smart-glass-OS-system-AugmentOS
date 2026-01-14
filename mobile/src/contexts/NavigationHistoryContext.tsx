import {router, useFocusEffect, useNavigationContainerRef, usePathname, useSegments} from "expo-router"
import {createContext, useContext, useEffect, useRef, useCallback, useState} from "react"
import {Alert, BackHandler} from "react-native"
import {useNavigation} from "expo-router"
import {CommonActions, StackActions} from "@react-navigation/native"

import {navigationRef} from "@/contexts/NavigationRef"

export type NavigationHistoryPush = (path: string, params?: any) => void
export type NavigationHistoryReplace = (path: string, params?: any) => void
export type NavigationHistoryReplaceAll = (path: string, params?: any) => void
export type NavigationHistoryGoBack = () => void

export type NavObject = {
  push: NavigationHistoryPush
  replace: NavigationHistoryReplace
  replaceAll: NavigationHistoryReplaceAll
  goBack: NavigationHistoryGoBack
  setPendingRoute: (route: string) => void
  getPendingRoute: () => string | null
  navigate: (path: string, params?: any) => void
  preventBack: boolean
}

interface NavigationHistoryContextType {
  goBack: () => void
  getHistory: () => string[]
  getPreviousRoute: () => string | null
  clearHistory: () => void
  push: (path: string, params?: any) => void
  replace: (path: string, params?: any) => void
  setPendingRoute: (route: string | null) => void
  getPendingRoute: () => string | null
  navigate: (path: string, params?: any) => void
  clearHistoryAndGoHome: () => void
  replaceAll: (path: string, params?: any) => void
  goHomeAndPush: (path: string, params?: any) => void
  preventBack: boolean
  setPreventBack: (value: boolean) => void
  pushPrevious: (index?: number) => void
  pushUnder: (path: string, params?: any) => void
  incPreventBack: () => void
  decPreventBack: () => void
  setAndroidBackFn: (fn: () => void) => void
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | undefined>(undefined)

export function NavigationHistoryProvider({children}: {children: React.ReactNode}) {
  const historyRef = useRef<string[]>([])
  const historyParamsRef = useRef<any[]>([])
  const [history, setDebugHistory] = useState<string[]>([])// for debugging only!

  const pathname = usePathname()
  const _segments = useSegments()
  const pendingRoute = useRef<string | null>(null)
  const navigation = useNavigation()
  const [preventBack, setPreventBack] = useState(false)
  const preventBackCountRef = useRef(0)
  const androidBackFnRef = useRef<() => void | undefined>(undefined)
  const setAndroidBackFn = (fn: () => void) => {
    androidBackFnRef.current = fn
  }
  const rootNavigation = useNavigationContainerRef()

  useEffect(() => {
    const newPath = pathname

    if (historyRef.current.length < 1) {
      historyRef.current.push(newPath)
      setDebugHistory([...historyRef.current])
      return
    }

    // Keep history limited to prevent memory issues (keep last 20 entries)
    if (historyRef.current.length > 20) {
      historyRef.current = historyRef.current.slice(-20)
      setDebugHistory([...historyRef.current])
    }

    // Add current path to history if it's different from the last entry and not the previous path:
    const curPath = historyRef.current[historyRef.current.length - 1]
    const prevPath = historyRef.current[historyRef.current.length - 2]
    console.log("NAV: prevPath", prevPath)
    console.log("NAV: curPath", curPath)
    console.log("NAV: newPath", newPath)
    if (newPath === prevPath) {
      return
    }
    if (newPath == curPath) {
      return
    }
    historyRef.current.push(newPath)
    setDebugHistory([...historyRef.current])
    // if (prevPath !== null) {
    //   if (prevPath !== curPath && curPath !== newPath) {
    //     historyRef.current.push(newPath)
    //   }
    // } else {
    //   if (newPath !== curPath) {
    //     historyRef.current.push(newPath)
    //   }
    // }
  }, [pathname])

  // block the back button on android when preventBack is true:
  useEffect(() => {
    // if (!preventBack) return
    console.log("NAV: REGISTERING BACK HANDLER =========================")
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      console.log("NAV: BACK HANDLER CALLED =========================")
      if (androidBackFnRef.current) {
        androidBackFnRef.current()
      }
      return true
    })
    return () => backHandler.remove()
  }, [preventBack])

  const incPreventBack = useCallback(() => {
    preventBackCountRef.current++
    setPreventBack(true)
  }, [])

  const decPreventBack = useCallback(() => {
    preventBackCountRef.current--
    if (preventBackCountRef.current <= 0) {
      preventBackCountRef.current = 0
      setPreventBack(false)
      androidBackFnRef.current = undefined
    }
  }, [])

  useEffect(() => {
    let sub = navigation.addListener("state", (state) => {
      // console.log("NAV: iOS: state", state)
      // console.log("NAV: iOS: state.routeNames", state.data.state.routeNames)
      // console.log("NAV: iOS: state.routes", state.data.state.routes)
      // let a = state.data.state.routes
      // console.log("NAV: iOS: a", a[0].state?.routes)
      // if (a.length > 1) {
      //   console.log("NAV: iOS: b", a[1])
      // }
      // console.log("NAV: iOS: BBB", state.data.state)
    })
  }, [navigation])

  // useEffect(() => {
  //   let currentRoute = rootNavigation.getCurrentRoute()
  //   console.log("NAV: iOS: currentRoute", currentRoute)
  //   let currentRouteOptions = rootNavigation.getCurrentOptions()
  //   console.log("NAV: iOS: currentRouteOptions", currentRouteOptions)
  // }, [pathname])

  // const unsubscribe = rootNavigation..addListener("beforeRemove", (e) => {
  //   // Triggered on back swipe, back button, or programmatic goBack()
  //   console.log("NAV: iOS: User is leaving the screen")

  //   // Optionally prevent navigation:
  //   // e.preventDefault()
  // })

  // useEffect(() => {
  //   console.log("NAV: iOS: useEffect()")
  //   const unsubscribe = navigation.addListener("beforeRemove", (e) => {
  //     // Triggered on back swipe, back button, or programmatic goBack()
  //     console.log("NAV: iOS: User is leaving the screen")

  //     // Optionally prevent navigation:
  //     // e.preventDefault()
  //   })

  //   return unsubscribe
  // }, [navigation])

  // subscribe to route changes and check if a back button was used:
  const oldPathRef = useRef<string | null>(null)
  useEffect(() => {
    // let sub = navigation.addListener("state", (state) => {
    //   console.log("NAV: iOS: state", state)
    // })
    // return () => sub.remove()

    const oldPath = oldPathRef.current
    const newPath = pathname

    if (historyRef.current.length < 2) {
      oldPathRef.current = pathname
      return
    }

    if (oldPath !== null && oldPath !== newPath) {
      console.log("Previous:", oldPath)
      console.log("Current:", newPath)

      console.log("NAV: historyRef.current", historyRef.current)

      // if our previous pathname is the current pathname, and the current pathname is n-1, then we have navigated back:
      const curHistoryIndex = historyRef.current.length - 1
      const prevHistoryIndex = curHistoryIndex - 1
      const prevHistoryPath = historyRef.current[prevHistoryIndex]
      const curHistoryPath = historyRef.current[curHistoryIndex]

      if (newPath === prevHistoryPath && oldPath === curHistoryPath) {
        console.log("NAV: SILENT_BACK_DETECTED")
        // we need to update the historyRef and historyParamsRef to pop the last route:
        historyRef.current.pop()
        historyParamsRef.current.pop()
        setDebugHistory([...historyRef.current])
      }
    }

    // update ref *after* comparison
    oldPathRef.current = pathname
  }, [pathname])

  const goBack = () => {
    console.info("NAV: goBack()")
    const history = historyRef.current

    // Remove current path
    history.pop()
    historyParamsRef.current.pop()
    setDebugHistory([...historyRef.current])

    // Get previous path
    const previousPath = history[history.length - 1]
    const _previousParams = historyParamsRef.current[historyParamsRef.current.length - 1]

    console.info(`NAV: going back to: ${previousPath}`)
    // if (previousPath) {
    //   // Fallback to direct navigation if router.back() fails
    //   // router.replace({pathname: previousPath as any, params: previousParams as any})
    // } else if (router.canGoBack()) {
    //   router.back()
    // } else {
    //   // Ultimate fallback to home tab
    //   router.replace("/home")
    // }
    if (router.canGoBack()) {
      router.back()
    }
  }

  const push = (path: string, params?: any): void => {
    console.info("NAV: push()", path)
    // if the path is the same as the last path, don't add it to the history
    if (historyRef.current[historyRef.current.length - 1] === path) {
      return
    }

    historyRef.current.push(path)
    historyParamsRef.current.push(params)
    setDebugHistory([...historyRef.current])

    router.push({pathname: path as any, params: params as any})
  }

  const replace = (path: string, params?: any): void => {
    console.info("NAV: replace()", path)
    historyRef.current.pop()
    historyParamsRef.current.pop()
    historyRef.current.push(path)
    historyParamsRef.current.push(params)
    setDebugHistory([...historyRef.current])
    router.replace({pathname: path as any, params: params as any})
  }

  const getHistory = () => {
    return history
  }

  const getPreviousRoute = () => {
    if (historyRef.current.length < 2) {
      return null
    }
    return historyRef.current[historyRef.current.length - 2]
  }

  const clearHistory = () => {
    console.info("NAV: clearHistory()")
    historyRef.current = []
    historyParamsRef.current = []
    setDebugHistory([...historyRef.current])
    try {
      router.dismissAll()
    } catch (_e) {}
    try {
      router.dismissTo("/home")
      // router.dismissTo("/")
      // router.replace("/")
      // router.
    } catch (_e) {}
    // try {
    //   router.dismissTo("/")
    // } catch (_e) {}
  }

  const setPendingRoute = (route: string | null) => {
    console.info("NAV: setPendingRoute()", route)
    // setPendingRouteNonClashingName(route)
    pendingRoute.current = route
  }

  const getPendingRoute = () => {
    return pendingRoute.current
  }

  const navigate = (path: string, params?: any) => {
    console.info("NAV: navigate()", path)
    router.navigate({pathname: path as any, params: params as any})
  }

  const clearHistoryAndGoHome = () => {
    console.info("NAV: clearHistoryAndGoHome()")
    clearHistory()
    try {
      // router.dismissAll()
      // router.dismissTo("/")
      // router.navigate("/")
      router.replace("/home")
      historyRef.current = ["/home"]
      historyParamsRef.current = [undefined]
      setDebugHistory([...historyRef.current])
    } catch (error) {
      console.error("NAV: clearHistoryAndGoHome() error", error)
    }
  }

  // whatever route we pass, will be the only route in the entire stack:
  // dismiss all and push the new route:
  const replaceAll = (path: string, params?: any) => {
    console.info("NAV: replaceAll()", path)
    clearHistory()
    // try {
    //   // router.dismissAll()
    //   // router.dismissTo("/")
    //   // router.navigate("/")
    //   // router.dismissAll()
    //   // router.replace("/")
    // } catch (_e) {
    // }
    // replace(path, params)
    // push(path, params)
    historyRef.current = [path]
    historyParamsRef.current = [params]
    setDebugHistory([...historyRef.current])
    router.replace({pathname: path as any, params: params as any})
  }

  const pushUnder = (path: string, params?: any) => {
    console.info("NAV: pushUnder()", path)
    // historyRef.current.push(path)
    // historyParamsRef.current.push(params)
    // router.push({pathname: path as any, params: params as any})

    // get current path:
    const currentIndex = historyRef.current.length - 1
    const currentPath = historyRef.current[currentIndex]
    const currentParams = historyParamsRef.current[currentIndex]

    // Build routes WITHOUT the current one
    const previousRoutes = historyRef.current.slice(0, -1).map((path, index) => ({
      name: path,
      params: historyParamsRef.current[index],
    }))

    // console.log("NAV: previousRoutes", previousRoutes)

    const newRoutes = [
      ...previousRoutes,
      {name: path, params: params}, // New "under" route
      {name: currentPath, params: currentParams}, // Current screen stays on top
    ]

    // console.log("NAV: newRoutes", newRoutes.map((route) => route.name))

    navigation.dispatch(
      CommonActions.reset({
        index: newRoutes.length - 1, // Point to current screen (last)
        routes: newRoutes,
      }),
    )

    // rootNavigation.dispatch(
    //   CommonActions.reset({
    //     index: newRoutes.length - 1, // Point to current screen (last)
    //     routes: newRoutes,
    //   }),
    // )

    // Insert new path right before current in history
    historyRef.current.splice(currentIndex, 0, path)
    historyParamsRef.current.splice(currentIndex, 0, params)
    setDebugHistory([...historyRef.current])
  }

  const pushList = (routes: string[], params: any[]) => {
    console.info("NAV: pushList()", routes)
    const first = routes.shift()
    const firstParams = params.shift()
    push(first!, firstParams)
    // go bottom to top and pushUnder the rest (in reverse order):
    for (let i = routes.length - 1; i >= 0; i--) {
      pushUnder(routes[i], params[i])
    }
  }

  // when you want to go back, but animate it like a push:
  const pushPrevious = (index: number = 0) => {
    console.info("NAV: pushPrevious()")
    console.log("NAV: historyRef.current", historyRef.current)
    console.log("NAV: historyParamsRef.current", historyParamsRef.current)
    // const prevIndex = historyRef.current.length - (2 + index)
    // const previousPath = historyRef.current[prevIndex]
    // const previousParams = historyParamsRef.current[prevIndex]
    // clearHistory()
    // push(previousPath as any, previousParams as any)

    const last = index + 2
    const lastRouteIndex = historyRef.current.length - last
    // the route we want to later "push" onto the stack:
    const lastRoute = historyRef.current[lastRouteIndex]
    console.log("NAV: lastRoute", lastRoute)
    const lastRouteParams = historyParamsRef.current[lastRouteIndex]

    // Build routes WITHOUT n routes (removing current and last n routes)
    const n = index + 2
    let updatedRoutes = historyRef.current.slice(0, -n)
    let updatedRoutesParams = historyParamsRef.current.slice(0, -n)

    // // remove any /home routes (remove the same index from updatedRoutesParams):
    // updatedRoutes.forEach((path, index) => {
    //   if (path === "/home") {
    //     updatedRoutes.splice(index, 1)
    //     updatedRoutesParams.splice(index, 1)
    //   }
    // })
    // remov
    // // add ghost route:
    // updatedRoutes.push("/")
    // updatedRoutesParams.push(undefined)

    // re-add the last (soon to be new current) route:
    updatedRoutes.push(lastRoute)
    updatedRoutesParams.push(lastRouteParams)

    const newRouteState = updatedRoutes.map((path, index) => ({
      name: path,
      params: updatedRoutesParams[index],
    }))

    console.log("NAV: updatedRoutes", updatedRoutes)

    console.log(
      "NAV: newRouteState",
      newRouteState.map((route) => route.name),
    )

    clearHistoryAndGoHome()

    if (lastRoute === "/home") {
      return // we are already on home, so we are done
    }

    // if /home is at the start of the list remove it:
    if (updatedRoutes[0] === "/home") {
      updatedRoutes.shift()
      updatedRoutesParams.shift()
    }
    updatedRoutes.reverse() // reverse for the pushList function
    updatedRoutesParams.reverse() // must also reverse params to keep them aligned!
    console.log("NAV: updatedRoutes", updatedRoutes)
    console.log("NAV: updatedRoutesParams", updatedRoutesParams)
    pushList(updatedRoutes, updatedRoutesParams)

    // rootNavigation.dispatch(StackActions.popToTop())
    // rootNavigation.dispatch(
    //   CommonActions.reset({
    //     index: newRouteState.length - 1, // Point to current screen (last)
    //     routes: newRouteState,
    //   }),
    // )

    // // update our history ref popping the last n elements:
    // historyRef.current = updatedRoutes
    // historyParamsRef.current = updatedRoutesParams

    // console.log("NAV: updated historyRef.current", historyRef.current)
    // console.log("NAV: updated historyParamsRef.current", historyParamsRef.current)

    // console.log("NAV: pushing lastRoute", lastRoute, lastRouteParams)
    // push(lastRoute, lastRouteParams)
  }

  // the only routes in the stack will be home and the one we pass:
  const goHomeAndPush = (path: string, params?: any) => {
    console.info("NAV: goHomeAndPush()", path)
    clearHistoryAndGoHome()
    push(path, params)
  }

  const navObject: NavObject = {
    push,
    replace,
    replaceAll,
    goBack,
    setPendingRoute,
    getPendingRoute,
    navigate,
    preventBack,
  }

  // Set the ref so we can use it from outside the context:
  useEffect(() => {
    navigationRef.current = navObject
  }, [preventBack])

  return (
    <NavigationHistoryContext.Provider
      value={{
        goBack,
        getHistory,
        getPreviousRoute,
        clearHistory,
        push,
        replace,
        setPendingRoute,
        getPendingRoute,
        navigate,
        clearHistoryAndGoHome,
        replaceAll,
        goHomeAndPush,
        setPreventBack,
        preventBack,
        pushPrevious,
        pushUnder,
        incPreventBack,
        decPreventBack,
        setAndroidBackFn,
      }}>
      {children}
    </NavigationHistoryContext.Provider>
  )
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext)
  if (context === undefined) {
    throw new Error("useNavigationHistory must be used within a NavigationHistoryProvider")
  }
  return context
}

// export const focusEffectPreventBack = () => {
//   const {setPreventBack} = useNavigationHistory()

//   useFocusEffect(
//     useCallback(() => {
//       setPreventBack(true)
//       return () => {
//         setPreventBack(false)
//       }
//     }, []),
//   )
// }

// screens that call this function will prevent the back button from being pressed:
export const focusEffectPreventBack = (androidBackFn?: () => void) => {
  const {incPreventBack, decPreventBack, setAndroidBackFn} = useNavigationHistory()

  useFocusEffect(
    useCallback(() => {
      incPreventBack()
      if (androidBackFn) {
        setAndroidBackFn(androidBackFn)
      }
      return () => {
        decPreventBack()
      }
    }, [incPreventBack, decPreventBack]),
  )
}
