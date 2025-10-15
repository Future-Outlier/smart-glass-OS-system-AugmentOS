import ExpoModulesCore

public class CoreModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Core")

        // Define events that can be sent to JavaScript
        Events("CoreMessageEvent", "onChange")

        OnCreate {
            // Initialize Bridge with event callback
            Bridge.initialize { [weak self] eventName, data in
                self?.sendEvent(eventName, data)
            }
        }

        // Expose Bridge.handleCommand for JavaScript to call
        AsyncFunction("handleCommand") { (command: String) -> Any in
            return Bridge.handleCommand(command)
        }

        // android stubs:
        AsyncFunction("getInstalledApps") { () -> Any in
            return nil
        }

        AsyncFunction("hasNotificationListenerPermission") { () -> Any in
            return nil
        }
    }
}
