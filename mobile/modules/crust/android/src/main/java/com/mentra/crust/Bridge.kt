//
//  Bridge.kt
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

package com.mentra.crust

import android.util.Base64
import android.util.Log
import java.util.HashMap
import kotlin.jvm.JvmStatic
import kotlin.jvm.Synchronized
import kotlin.jvm.Volatile
import org.json.JSONObject

/**
 * Bridge class for core communication between Expo modules and native Android code This is the
 * Android equivalent of the iOS Bridge.swift
 */
public class Bridge private constructor() {
    private var coreManager: CoreManager? = null

    companion object {
        private const val TAG = "Bridge"

        @Volatile private var instance: Bridge? = null

        // Event callback for sending events to JS
        private var eventCallback: ((String, Map<String, Any>) -> Unit)? = null

        // Android Context for native operations
        private var appContext: android.content.Context? = null

        @JvmStatic
        @Synchronized
        fun getInstance(): Bridge {
            if (instance == null) {
                instance = Bridge()
            }
            return instance!!
        }

        /**
         * Initialize the Bridge with event callback and context This should be called from
         * CoreModule
         */
        @JvmStatic
        fun initialize(
                context: android.content.Context,
                callback: (String, Map<String, Any>) -> Unit
        ) {
            Log.d(TAG, "Initializing Bridge with context and event callback")
            appContext = context
            eventCallback = callback
        }

        /** Get the Android context for native operations */
        @JvmStatic
        fun getContext(): android.content.Context {
            return appContext ?: throw IllegalStateException("Bridge not initialized with context")
        }

        /** Log a message and send it to JavaScript */
        @JvmStatic
        fun log(message: String) {
            val msg = "CRUST:$message"
            sendEvent("crust_event", msg)
        }

        /** Send an event to JavaScript */
        @JvmStatic
        fun sendEvent(eventName: String, body: String) {
            val data = HashMap<String, Any>()
            data["body"] = body
            eventCallback?.invoke(eventName, data as Map<String, Any>)
        }

        /** Get supported events Don't add to this list, use a typed message instead */
        @JvmStatic
        fun getSupportedEvents(): Array<String> {
            return arrayOf("crust_event")
        }

        /**
         * Send a typed message to JavaScript Don't call this function directly, instead make a
         * function above that calls this function
         */
        @JvmStatic
        private fun sendTypedMessage(type: String, body: Map<String, Any>) {
            var mutableBody = body
            if (body !is HashMap) {
                mutableBody = HashMap(body)
            }
            (mutableBody as HashMap<String, Any>)["type"] = type

            try {
                // Check if event callback is available before proceeding
                if (eventCallback == null) {
                    Log.w(TAG, "Cannot send typed message '$type': eventCallback is null (app may be killed/backgrounded)")
                    return
                }

                val jsonData = JSONObject(mutableBody as Map<*, *>)
                val jsonString = jsonData.toString()

                val eventData = HashMap<String, Any>()
                eventData["body"] = jsonString

                // Additional safety: wrap the actual callback invocation
                try {
                    eventCallback?.invoke("crust_event", eventData as Map<String, Any>)
                } catch (e: Exception) {
                    Log.e(TAG, "Error invoking eventCallback for type '$type' (React Native may be dead)", e)
                    // Don't rethrow - this prevents crashes when RN context is destroyed
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending typed message of type '$type'", e)
            }
        }
    }

    init {
        // coreManager = CoreManager.Companion.getInstance()
        // if (coreManager == null) {
        //     Log.e(TAG, "Failed to initialize CoreManager in Bridge constructor")
        // }
    }
}
