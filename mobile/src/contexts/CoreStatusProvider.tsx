import {INTENSE_LOGGING} from "@/utils/Constants"
import {CoreStatus, CoreStatusParser} from "@/utils/CoreStatusParser"
import {createContext, ReactNode, useCallback, useContext, useEffect, useState} from "react"

import {deepCompare} from "@/utils/debug/debugging"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

interface CoreStatusContextType {
  status: CoreStatus
  refreshStatus: (data: any) => void
}

const CoreStatusContext = createContext<CoreStatusContextType | undefined>(undefined)

export const CoreStatusProvider = ({children}: {children: ReactNode}) => {
  const [status, setStatus] = useState<CoreStatus>(() => {
    return CoreStatusParser.parseStatus({})
  })

  const refreshStatus = useCallback((data: any) => {
    if (!(data && "core_status" in data)) {
      return
    }

    const parsedStatus = CoreStatusParser.parseStatus(data)
    if (INTENSE_LOGGING) console.log("CoreStatus: status:", parsedStatus)

    // only update the status if diff > 0
    setStatus(prevStatus => {
      const diff = deepCompare(prevStatus, parsedStatus)
      if (diff.length === 0) {
        console.log("CoreStatus: Status did not change")
        return prevStatus // don't re-render
      }

      console.log("CoreStatus: Status changed:", diff)
      return parsedStatus
    })
  }, [])

  useEffect(() => {
    const handleCoreStatusUpdate = (data: any) => {
      if (INTENSE_LOGGING) console.log("Handling received data.. refreshing status..")
      refreshStatus(data)
    }

    const handleWifiStatusChange = (data: {connected: boolean; ssid?: string; local_ip?: string}) => {
      console.log("CoreStatus: WiFi status changed, updating UI:", data)
      setStatus(prevStatus => {
        // Only update if we have connected glasses
        if (!prevStatus.glasses_info) {
          console.log("CoreStatus: No glasses connected, skipping WiFi update")
          return prevStatus
        }

        // Update the WiFi info in glasses_info
        return {
          ...prevStatus,
          glasses_info: {
            ...prevStatus.glasses_info,
            glasses_wifi_connected: data.connected,
            glasses_wifi_ssid: data.ssid || "",
            glasses_wifi_local_ip: data.local_ip || "",
          },
        }
      })
    }

    GlobalEventEmitter.on("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
    GlobalEventEmitter.on("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)

    return () => {
      GlobalEventEmitter.removeListener("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
      GlobalEventEmitter.removeListener("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)
    }
  }, [])

  return (
    <CoreStatusContext.Provider
      value={{
        status,
        refreshStatus,
      }}>
      {children}
    </CoreStatusContext.Provider>
  )
}

export const useCoreStatus = () => {
  const context = useContext(CoreStatusContext)
  if (!context) {
    throw new Error("useStatus must be used within a StatusProvider")
  }
  return context
}
