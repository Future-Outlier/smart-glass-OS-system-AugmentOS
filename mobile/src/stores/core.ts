import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"
import { CoreStatus } from "core"


interface CoreState extends CoreStatus {
  setCoreInfo: (info: Partial<CoreStatus>) => void
  reset: () => void
}

const initialState: CoreStatus = {
  // state:
  searching: false,
  micRanking: [],
  systemMicUnavailable: false,
  currentMic: null,
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
