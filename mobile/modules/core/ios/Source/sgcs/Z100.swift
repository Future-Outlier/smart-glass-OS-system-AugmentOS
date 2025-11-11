//
//  Z100.swift
//  MentraOS_Manager
//
//  Z100 uses the same Vuzix Ultralite SDK as Mach1
//  This is just a thin wrapper to set the correct device type
//

import Foundation

class Z100: Mach1 {
    // Override the type to report as Z100 instead of Mach1
    override var type: String {
        return DeviceTypes.Z100
    }
}
