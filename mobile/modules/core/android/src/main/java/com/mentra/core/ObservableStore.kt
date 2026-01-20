package com.mentra.core

import kotlinx.coroutines.*

/**
 * Observable state management with debounced event emission
 */
class ObservableStore {
    private val values = mutableMapOf<String, Any>()
    private var onEmit: ((String, Map<String, Any>) -> Unit)? = null
    private val pendingChanges = mutableMapOf<String, MutableMap<String, Any>>()
    private var debounceJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun configure(onEmit: (String, Map<String, Any>) -> Unit) {
        this.onEmit = onEmit
    }

    fun set(category: String, key: String, value: Any) {
        val fullKey = "$category.$key"
        val oldValue = values[fullKey]

        // Skip if unchanged
        if (oldValue == value) return

        values[fullKey] = value

        // Accumulate changes per category
        pendingChanges.getOrPut(category) { mutableMapOf() }[key] = value

        // Debounce emit (16ms ≈ 1 frame at 60fps)
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(16)
            flushChanges()
        }
    }

    fun get(category: String, key: String): Any? = values["$category.$key"]

    fun getCategory(category: String): Map<String, Any> {
        val prefix = "$category."
        return values.filterKeys { it.startsWith(prefix) }
            .mapKeys { it.key.removePrefix(prefix) }
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
