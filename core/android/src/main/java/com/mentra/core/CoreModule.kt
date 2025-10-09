package com.mentra.core

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CoreModule : Module() {
  private val bridge: Bridge by lazy { Bridge.getInstance() }

  override fun definition() = ModuleDefinition {
    Name("Core")

    // Define events that can be sent to JavaScript
    Events("CoreMessageEvent", "onChange")

    OnCreate {
      // Initialize Bridge with Android context and event callback
      Bridge.initialize(appContext.reactContext ?: appContext.currentActivity ?: throw IllegalStateException("No context available")) { eventName, data ->
        sendEvent(eventName, data)
      }
    }

    Function("hello") {
      "MentraOS Core Module"
    }

    // Expose Bridge.handleCommand for JavaScript to call
    AsyncFunction("handleCommand") { command: String ->
      bridge.handleCommand(command)
    }
  }
}
