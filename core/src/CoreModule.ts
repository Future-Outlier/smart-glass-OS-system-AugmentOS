import {NativeModule, requireNativeModule} from "expo"

import {CoreModuleEvents} from "./Core.types"

declare class CoreModule extends NativeModule<CoreModuleEvents> {
  handleCommand(command: string): Promise<any>
}

// This call loads the native module object from the JSI.
export default requireNativeModule<CoreModule>("Core")
