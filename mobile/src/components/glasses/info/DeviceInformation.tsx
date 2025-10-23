import InfoSection from "@/components/ui/InfoSection"

interface DeviceInformationProps {
  bluetoothName?: string
  buildNumber?: string
  localIpAddress?: string
}

export function DeviceInformation({bluetoothName, buildNumber, localIpAddress}: DeviceInformationProps) {
  return (
    <InfoSection
      title="Device Information"
      items={[
        {label: "Bluetooth Name", value: bluetoothName?.split("_")[3]},
        {label: "Build Number", value: buildNumber},
        {label: "Local IP Address", value: localIpAddress},
      ]}
    />
  )
}
