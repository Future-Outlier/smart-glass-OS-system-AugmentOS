//
//  ObservableStore.swift
//  Core
//
//  Observable state management with debounced event emission
//

import Foundation

@MainActor
class ObservableStore {
    private var values: [String: Any] = [:]
    private var onEmit: ((String, [String: Any]) -> Void)?
    private var pendingChanges: [String: [String: Any]] = [:]
    private var debounceTask: Task<Void, Never>?

    func configure(onEmit: @escaping (String, [String: Any]) -> Void) {
        self.onEmit = onEmit
    }

    func set(_ category: String, _ key: String, _ value: Any) {
        let fullKey = "\(category).\(key)"
        let oldValue = values[fullKey]

        // Skip if unchanged (compare primitive types)
        if let old = oldValue, areEqual(old, value) {
            return
        }

        values[fullKey] = value

        // Accumulate changes per category
        if pendingChanges[category] == nil {
            pendingChanges[category] = [:]
        }
        pendingChanges[category]?[key] = value

        // Debounce emit
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 16_000_000) // ~1 frame at 60fps
            guard !Task.isCancelled else { return }
            flushChanges()
        }
    }

    func get(_ category: String, _ key: String) -> Any? {
        values["\(category).\(key)"]
    }

    func getCategory(_ category: String) -> [String: Any] {
        var result: [String: Any] = [:]
        let prefix = "\(category)."
        for (key, value) in values where key.hasPrefix(prefix) {
            let shortKey = String(key.dropFirst(prefix.count))
            result[shortKey] = value
        }
        return result
    }

    private func flushChanges() {
        for (category, changes) in pendingChanges where !changes.isEmpty {
            onEmit?(category, changes)
        }
        pendingChanges.removeAll()
    }

    // Helper to compare values
    private func areEqual(_ lhs: Any, _ rhs: Any) -> Bool {
        // Handle primitive types
        if let l = lhs as? String, let r = rhs as? String { return l == r }
        if let l = lhs as? Int, let r = rhs as? Int { return l == r }
        if let l = lhs as? Bool, let r = rhs as? Bool { return l == r }
        if let l = lhs as? Double, let r = rhs as? Double { return l == r }
        return false
    }
}
