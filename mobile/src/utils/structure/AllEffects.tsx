import {ButtonActions} from "@/effects/ButtonActions"
import {MtkUpdateAlert} from "@/effects/MtkUpdateAlert"
import {NetworkMonitoring} from "@/effects/NetworkMonitoring"
import {OtaUpdateChecker} from "@/effects/OtaUpdateChecker"
import {Reconnect} from "@/effects/Reconnect"
import {ConsoleLogger} from "@/utils/debug/console"

export const AllEffects = () => {
  return (
    <>
      <Reconnect />
      <OtaUpdateChecker />
      <MtkUpdateAlert />
      <NetworkMonitoring />
      <ButtonActions />
      <ConsoleLogger />
    </>
  )
}
