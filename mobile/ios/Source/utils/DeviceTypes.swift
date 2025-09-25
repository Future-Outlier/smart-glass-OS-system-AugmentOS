struct DeviceTypes {
    static let SIMULATED = "Simulated Glasses"
    static let G1 = "Even Realities G1"
    static let LIVE = "Mentra Live"
    static let MACH1 = "Mentra Mach1"
    static let Z100 = "Vuzix Z100"
    static let NEX = "Mentra Nex"
    static let FRAME = "Brilliant Frame"

    static let ALL = [
        SIMULATED,
        G1,
        MACH1,
        LIVE,
        Z100,
        FRAME,
    ]

    // Private init to prevent instantiation
    private init() {}
}
