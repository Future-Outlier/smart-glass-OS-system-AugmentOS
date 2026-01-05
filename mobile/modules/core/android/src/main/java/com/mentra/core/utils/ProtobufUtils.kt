package com.mentra.core.utils
import com.mentra.core.protobuf.PhoneToGlasses

import java.nio.ByteBuffer
import java.io.IOException

import android.content.Context
import android.util.Log

import com.mentra.core.Bridge

object ProtobufUtils {
    private const val TAG = "ProtobufUtils"

    private const val PACKET_TYPE_PROTOBUF: Byte = 0x01
    
    /**
     * Extracts the protobuf schema version from the proto file
     */
    fun getProtoVersion(context: Context): Int {
        return try {
            // Try to read from assets first
            readProtoVersionFromAssets(context)?.toIntOrNull() 
                ?: readProtoVersionFromResources(context)?.toIntOrNull()
                ?: readProtoVersionFromProject(context)?.toIntOrNull()
                ?: 1 // Default version
        } catch (e: Exception) {
            Bridge.log("Error getting protobuf version: ${e.message}", Log.ERROR, e)
            1 // Fallback to version 1
        }
    }

    fun generateVersionRequestCommandBytes() {
        val msgId = "ver_req_${System.currentTimeMillis()}"
        val versionRequest = VersionRequest.newBuilder()
            .setMsgId(msgId)
            .build()
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setMsgId(msgId)
            .setVersionRequest(versionRequest)
            .build()
        return generateProtobufCommandBytes(phoneToGlasses)
    }

    fun generateBatteryStateRequestCommandBytes() {
        val batteryStateRequest = BatteryStateRequest.newBuilder().build()
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setBatteryState(batteryStateRequest)
            .build()
        return generateProtobufCommandBytes(phoneToGlasses)
    }

    private fun generateProtobufCommandBytes(phoneToGlasses: PhoneToGlasses): ByteArray {
        val contentBytes = phoneToGlasses.toByteArray()
        val chunk = ByteBuffer.allocate(contentBytes.size + 1)

        chunk.put(PACKET_TYPE_PROTOBUF)
        chunk.put(contentBytes)

        // Enhanced logging for protobuf messages
        val result = chunk.array()
        logProtobufMessage(phoneToGlasses, result)

        return result
    }

    private fun logProtobufMessage(phoneToGlasses: PhoneToGlasses, fullMessage: ByteArray) {
        val logMessage = buildString {
            appendLine("=== PROTOBUF MESSAGE TO GLASSES ===")
            appendLine("Message Type: ${phoneToGlasses.payloadCase}")

            // Extract and log text content if present
            when {
                phoneToGlasses.hasDisplayText() -> {
                    val text = phoneToGlasses.displayText.text
                    appendLine("Text Content: \"$text\"")
                    appendLine("Text Length: ${text.length} characters")
                }
                phoneToGlasses.hasDisplayScrollingText() -> {
                    val text = phoneToGlasses.displayScrollingText.text
                    appendLine("Scrolling Text Content: \"$text\"")
                    appendLine("Text Length: ${text.length} characters")
                }
            }

            // Log message size information
            appendLine("Protobuf Payload Size: ${phoneToGlasses.toByteArray().size} bytes")
            appendLine("Total Message Size: ${fullMessage.size} bytes")
            appendLine("Packet Type: 0x${PACKET_TYPE_PROTOBUF.toString(16).padStart(2, '0').uppercase()}")
            append("=====================================")
        }

        Bridge.log("Nex: $logMessage")
    }

    private fun readProtoVersionFromAssets(context: Context): String? {
        return try {
            context.assets.open("mentraos_ble.proto").use { inputStream ->
                val content = inputStream.bufferedReader().use { it.readText() }
                extractVersionFromProtoContent(content)
            }
        } catch (e: IOException) {
            Bridge.log("Could not read proto from assets: ${e.message}")
            null
        }
    }

    private fun readProtoVersionFromResources(context: Context): String? {
        return try {
            val resId = context.resources.getIdentifier("mentraos_ble", "raw", context.packageName)
            if (resId != 0) {
                context.resources.openRawResource(resId).use { inputStream ->
                    val content = inputStream.bufferedReader().use { it.readText() }
                    extractVersionFromProtoContent(content)
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Bridge.log("Could not read proto from resources: ${e.message}")
            null
        }
    }

    private fun readProtoVersionFromProject(context: Context): String? {
        val projectPaths = arrayOf(
            "../../mcu_client/mentraos_ble.proto",
            "../../../mcu_client/mentraos_ble.proto",
            "../../../../mcu_client/mentraos_ble.proto",
            "/data/data/${context.packageName}/../../mcu_client/mentraos_ble.proto",
            "${android.os.Environment.getExternalStorageDirectory()}/MentraOS/mcu_client/mentraos_ble.proto"
        )

        return projectPaths.firstNotNullOfOrNull { path ->
            try {
                val protoFile = java.io.File(path)
                if (protoFile.exists() && protoFile.canRead()) {
                    val content = protoFile.readText(Charsets.UTF_8)
                    extractVersionFromProtoContent(content)
                } else {
                    null
                }
            } catch (e: Exception) {
                null
            }
        }
    }

    private fun extractVersionFromProtoContent(content: String): String? {
        return try {
            val pattern = Regex("""option\s*\(\s*mentra_schema_version\s*\)\s*=\s*(\d+)\s*;""")
            pattern.find(content)?.groupValues?.get(1)
        } catch (e: Exception) {
            Bridge.log("Error extracting version from proto content: ${e.message}", Log.ERROR)
            null
        }
    }
}