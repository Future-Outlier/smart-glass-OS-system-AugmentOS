// types shared by the core
// any modifications made to this file should be replicated in Types.swift and Types.kt!

export const DeviceTypes = {
  SIMULATED: "Simulated Glasses",
  G1: "Even Realities G1",
  LIVE: "Mentra Live",
  MACH1: "Mentra Mach1",
  Z100: "Vuzix Z100",
  NEX: "Mentra Nex",
  FRAME: "Brilliant Frame",
  get ALL() {
    return [this.SIMULATED, this.G1, this.MACH1, this.LIVE, this.Z100, this.NEX, this.FRAME]
  },
} as const

export const ConnTypes = {
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
} as const
