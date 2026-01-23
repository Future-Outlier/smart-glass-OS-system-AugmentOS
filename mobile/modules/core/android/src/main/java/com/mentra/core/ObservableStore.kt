package com.mentra.core

import org.json.JSONObject
import kotlinx.coroutines.*

/** Observable state management with debounced event emission */
class ObservableStore {
    private val values = mutableMapOf<String, Any>()
    private var onEmit: ((String, Map<String, Any>) -> Unit)? = null
    private val pendingChanges = mutableMapOf<String, MutableMap<String, Any>>()
    private var debounceJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun configure(onEmit: (String, Map<String, Any>) -> Unit) {
        this.onEmit = onEmit
    }

    private fun deepEquals(a: Any?, b: Any?): Boolean {
        return when {
            a === b -> true
            a == null || b == null -> false
            a is List<*> && b is List<*> -> a == b // List.equals does content comparison
            a is Map<*, *> && b is Map<*, *> -> a == b
            else -> a == b
        }
    }

    private fun toJson(value: Any): String {
        return JSONObject(mapOf("v" to value)).toString()
    }

    fun set(category: String, key: String, value: Any) {
        val fullKey = "$category.$key"
        val oldValue = values[fullKey]

        // Skip if unchanged (with deep equality for lists/maps)
        if (oldValue != null && toJson(oldValue) == toJson(value)) return

        values[fullKey] = value

        // Accumulate changes per category
        pendingChanges.getOrPut(category) { mutableMapOf() }[key] = value

        // Debounce emit (16ms ≈ 1 frame at 60fps)
        debounceJob?.cancel()
        debounceJob =
                scope.launch {
                    delay(16)
                    flushChanges()
                }
    }

    fun get(category: String, key: String): Any? = values["$category.$key"]

    fun getCategory(category: String): Map<String, Any> {
        val prefix = "$category."
        return values.filterKeys { it.startsWith(prefix) }.mapKeys { it.key.removePrefix(prefix) }
    }

    private fun flushChanges() {
        pendingChanges.forEach { (category, changes) ->
            if (changes.isNotEmpty()) {
                onEmit?.invoke(category, changes.toMap())
            }
        }
        pendingChanges.clear()
    }
}
