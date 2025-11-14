import {OtaUpdateChecker} from "@/effects/OtaUpdateChecker"
import {Reconnect} from "@/effects/Reconnect"
import {SentrySetup} from "@/effects/SentrySetup"

export const AllEffects = () => {
  return (
    <>
      <SentrySetup />
      <Reconnect />
      <OtaUpdateChecker />
    </>
  )
}
