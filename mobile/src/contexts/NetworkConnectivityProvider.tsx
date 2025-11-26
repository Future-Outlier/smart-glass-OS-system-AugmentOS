import {createContext, ReactNode, useContext, useEffect, useState} from "react"

import {networkConnectivityService, NetworkStatus} from "@/services/asg/networkConnectivityService"
import {useGlassesStore} from "@/stores/glasses"

interface NetworkConnectivityContextType {
  networkStatus: NetworkStatus
  isGalleryReachable: boolean
  shouldShowWarning: () => boolean
  getStatusMessage: () => string
  checkConnectivity: () => Promise<NetworkStatus>
}

const NetworkConnectivityContext = createContext<NetworkConnectivityContextType | undefined>(undefined)

interface NetworkConnectivityProviderProps {
  children: ReactNode
}

export function NetworkConnectivityProvider({children}: NetworkConnectivityProviderProps) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(networkConnectivityService.getStatus())
  const wifiLocalIp = useGlassesStore(state => state.wifiLocalIp)
  const wifiConnected = useGlassesStore(state => state.wifiConnected)
  const wifiSsid = useGlassesStore(state => state.wifiSsid)
  const hotspotEnabled = useGlassesStore(state => state.hotspotEnabled)
  const hotspotGatewayIp = useGlassesStore(state => state.hotspotGatewayIp)
  const hotspotSsid = useGlassesStore(state => state.hotspotSsid)

  // Determine the active IP - ONLY use hotspot gateway IP when phone is connected to hotspot
  // Never use local WiFi IP - we only support hotspot mode for gallery
  const phoneConnectedToHotspot = networkStatus.phoneSSID && hotspotSsid && networkStatus.phoneSSID === hotspotSsid

  // Only use hotspot IP when phone is actually connected to the hotspot
  const activeGlassesIp = phoneConnectedToHotspot && hotspotGatewayIp ? hotspotGatewayIp : undefined
  const activeConnection = phoneConnectedToHotspot
  const activeSSID = phoneConnectedToHotspot ? hotspotSsid : undefined

  // Initialize network monitoring
  useEffect(() => {
    console.log("[NetworkConnectivityProvider] Initializing network monitoring")
    console.log("[NetworkConnectivityProvider] Initial glasses info from status:", {
      wifiConnected,
      wifiSsid,
      wifiLocalIp,
      hotspotEnabled,
      hotspotGatewayIp,
      hotspotSsid,
      activeConnection,
      activeGlassesIp,
      activeSSID,
    })

    // Initialize the service
    networkConnectivityService.initialize()

    // Subscribe to network changes
    const unsubscribe = networkConnectivityService.subscribe(status => {
      console.log("[NetworkConnectivityProvider] Network status updated:", status)
      setNetworkStatus(status)
    })

    // Set initial glasses status if available
    if (activeConnection !== undefined) {
      console.log("[NetworkConnectivityProvider] Setting initial glasses status")
      networkConnectivityService.updateGlassesStatus(wifiConnected, wifiSsid || null, activeGlassesIp || undefined)
    }

    // Cleanup
    return () => {
      console.log("[NetworkConnectivityProvider] Cleaning up network monitoring")
      unsubscribe()
      networkConnectivityService.destroy()
    }
  }, [])

  // Update glasses status when it changes
  useEffect(() => {
    console.log("[NetworkConnectivityProvider] Glasses status changed:", {
      wifiConnected,
      wifiSsid,
      wifiLocalIp,
      hotspotEnabled,
      hotspotGatewayIp,
      hotspotSsid,
      activeConnection,
      activeGlassesIp,
      activeSSID,
    })

    if (activeConnection !== undefined) {
      networkConnectivityService.updateGlassesStatus(wifiConnected, activeSSID || null, activeGlassesIp || undefined)
    }
  }, [activeConnection, activeSSID, activeGlassesIp])

  const value: NetworkConnectivityContextType = {
    networkStatus,
    isGalleryReachable: networkStatus.galleryReachable,
    shouldShowWarning: () => networkConnectivityService.shouldShowWarning(),
    getStatusMessage: () => networkConnectivityService.getStatusMessage(),
    checkConnectivity: () => networkConnectivityService.checkConnectivity(),
  }

  return <NetworkConnectivityContext.Provider value={value}>{children}</NetworkConnectivityContext.Provider>
}

export function useNetworkConnectivity() {
  const context = useContext(NetworkConnectivityContext)
  if (!context) {
    throw new Error("useNetworkConnectivity must be used within NetworkConnectivityProvider")
  }
  return context
}
