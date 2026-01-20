import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"
import { CoreStatus } from "core"



// export interface CoreInfo {
//   searching: boolean
//   powerSavingMode: boolean
//   metricSystem: boolean
//   micRanking: string[]
//   systemMicUnavailable: boolean
//   bypassVad: boolean
//   offlineMode: boolean
//   enforceLocalTranscription: boolean
//   alwaysOnStatusBar: boolean
//   sensingEnabled: boolean
// }

interface CoreState extends CoreStatus {
  setCoreInfo: (info: Partial<CoreStatus>) => void
  reset: () => void
}

const initialState: CoreStatus = {
  // state:
  is_searching: false,
  power_saving_mode: false,
  metric_system: false,
  //   system_mic_unavailable: false,
  //   current_mic: null,
  //   mic_ranking: [],
}

export const getCoreInfoPartial = (state: CoreStatus) => {
  return {
    is_searching: state.is_searching,
    power_saving_mode: state.power_saving_mode,
    metric_system: state.metric_system,
  }
}

export const useCoreStore = create<CoreState>()(
  subscribeWithSelector(set => ({
    ...initialState,

    setCoreInfo: info => set(state => ({...state, ...info})),

    reset: () => set(initialState),
  })),
)

// export const waitForGlassesState = <K extends keyof GlassesInfo>(
//   key: K,
//   predicate: (value: GlassesInfo[K]) => boolean,
//   timeoutMs = 1000,
// ): Promise<boolean> => {
//   return new Promise(resolve => {
//     const state = useGlassesStore.getState()
//     if (predicate(state[key])) {
//       resolve(true)
//       return
//     }

//     const unsubscribe = useGlassesStore.subscribe(
//       s => s[key],
//       value => {
//         if (predicate(value)) {
//           unsubscribe()
//           resolve(true)
//         }
//       },
//     )

//     setTimeout(() => {
//       unsubscribe()
//       resolve(predicate(useGlassesStore.getState()[key]))
//     }, timeoutMs)
//   })
// }
