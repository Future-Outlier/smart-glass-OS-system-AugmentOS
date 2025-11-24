import {MtkUpdateAlertEffect} from "@/effects/MtkUpdateAlertEffect"
import {OtaUpdateChecker} from "@/effects/OtaUpdateChecker"
import {Reconnect} from "@/effects/Reconnect"

export const AllEffects = () => {
  return (
    <>
      <Reconnect />
      <OtaUpdateChecker />
      <MtkUpdateAlertEffect />
    </>
  )
}
