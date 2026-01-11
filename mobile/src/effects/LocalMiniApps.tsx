import {useEffect, useRef} from "react"
import {Platform} from "react-native"

import {SETTINGS, useSetting} from "@/stores/settings"
import {useGlassesStore} from "@/stores/glasses"
import {usePathname} from "expo-router"
import {DeviceTypes} from "@/../../cloud/packages/types/src"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

// render the webviews of any local mini apps:
export function LocalMiniApps() {

    
  return null
}
