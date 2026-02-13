import {EventEmitter} from "events"

import mantle from "./MantleManager"
import CoreModule from "core"

export interface WebViewMessage {
  type: string
  payload?: any
  timestamp?: number
}

class MiniComms {
  private static instance: MiniComms | null = null
  private webViewMessageHandler: ((message: string) => void) | null = null
  private messageHandlers: Record<string, (message: WebViewMessage) => void> = {}

  private constructor() {
  }

  public static getInstance(): MiniComms {
    if (!MiniComms.instance) {
      MiniComms.instance = new MiniComms()
    }
    return MiniComms.instance
  }

  public cleanup() {
    this.webViewMessageHandler = null
    MiniComms.instance = null
  }

  // Register the WebView message sender
  public setWebViewMessageHandler(handler: (message: string) => void, packageName: string) {
    this.messageHandlers[packageName] = handler
  }

  // Send message to WebView
  public sendToWebView(message: WebViewMessage) {
    if (!this.webViewMessageHandler) {
      console.warn("SUPERCOMMS: No WebView message handler registered")
      return
    }

    try {
      const jsonMessage = JSON.stringify(message)
      this.webViewMessageHandler(jsonMessage)
      console.log(`SUPERCOMMS: Sent to WebView: ${message.type}`)
    } catch (error) {
      console.error(`SUPERCOMMS: Error sending to WebView:`, error)
    }
  }

  // Handle incoming message from WebView
  public handleWebViewMessage(packageName: string, data: string) {
    try {
      const message: WebViewMessage = JSON.parse(data)
      console.log(`SUPERCOMMS: Received from WebView: ${message.type} from ${packageName}`)

      // Handle specific message types
      this.handleMessage(packageName, message)
    } catch (error) {
      console.error(`SUPERCOMMS: Error parsing WebView message:`, error)
    }
  }

  private handle_data_update(message: WebViewMessage) {
    console.log(`SUPERCOMMS: Data updated:`, message.payload.count)
    mantle.displayTextMain(`count: ${message.payload.count}`)
  }

  private handleCoreFn(message: WebViewMessage) {
    const {fn, args} = message.payload
    console.log(`SUPERCOMMS: Core function:`, fn, args)
    CoreModule[fn](...args)
  }

  // Message handlers - these handle specific message types from WebView
  private handleMessage(packageName: string, message: WebViewMessage) {
    switch (message.type) {
      case "core_fn":
        this.handleCoreFn(message)
        break
      case "button_click":
        this.handleButtonClick(message)
        break

      case "page_ready":
        this.handlePageReady(message)
        break

      case "custom_action":
        this.handleCustomAction(message)
        break

      case "data_update":
        this.handle_data_update(message)
        break

      default:
        console.log(`SUPERCOMMS: Unknown message type: ${message.type}`)
    }
  }

  private handleButtonClick(message: WebViewMessage) {
    console.log(`SUPERCOMMS: Button clicked:`, message.payload)

    // Send a response back to WebView
    this.sendToWebView({
      type: "button_click_response",
      payload: {
        buttonId: message.payload?.buttonId,
        status: "success",
        message: `Button ${message.payload?.buttonId} clicked!`,
      },
      timestamp: Date.now(),
    })
  }

  private handlePageReady(_message: WebViewMessage) {
    console.log(`SUPERCOMMS: Page is ready`)

    // Send initial data to WebView
    this.sendToWebView({
      type: "init_data",
      payload: {
        message: "Welcome to SuperApp!",
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    })
  }

  private handleCustomAction(_message: WebViewMessage) {
    console.log(`SUPERCOMMS: Custom action:`, _message.payload)
  }

  // Public API for sending specific commands to WebView
  public sendNotification(title: string, message: string) {
    this.sendToWebView({
      type: "notification",
      payload: {title, message},
      timestamp: Date.now(),
    })
  }

  public updateData(data: any) {
    this.sendToWebView({
      type: "data_update",
      payload: data,
      timestamp: Date.now(),
    })
  }
}

const miniComms = MiniComms.getInstance()
export default miniComms
