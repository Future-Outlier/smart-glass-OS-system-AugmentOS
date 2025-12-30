//
//  Bridge.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation

// Bridge for core communication between Expo modules and native iOS code
// Has commands for the core to use to send messages to JavaScript
class Bridge {
    // Event callback for sending events to JS
    static var eventCallback: ((String, [String: Any]) -> Void)?

    static func initialize(callback: @escaping (String, [String: Any]) -> Void) {
        eventCallback = callback
    }

    static func log(_ message: String) {
        let msg = "CRUST:\(message)"
        let data: [String: Any] = ["body": msg]
        eventCallback?("crust_event", data)
    }

    static func sendEvent(withName: String, body: String) {
        let data: [String: Any] = ["body": body]
        eventCallback?(withName, data)
    }

    // don't call this function directly, instead
    // make a function above that calls this function:
    static func sendTypedMessage(_ type: String, body: [String: Any]) {
        var body = body
        body["type"] = type
        let jsonData = try! JSONSerialization.data(withJSONObject: body)
        let jsonString = String(data: jsonData, encoding: .utf8)
        let data: [String: Any] = ["body": jsonString!]
        eventCallback?("CoreMessageEvent", data)
    }
}
