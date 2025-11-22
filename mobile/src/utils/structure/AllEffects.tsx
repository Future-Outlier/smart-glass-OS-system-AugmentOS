import {OtaUpdateChecker} from "@/effects/OtaUpdateChecker"
import {MtkUpdateAlertEffect} from "@/effects/MtkUpdateAlertEffect"
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
