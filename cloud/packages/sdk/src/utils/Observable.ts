/**
 * Observable<T> - A reactive value wrapper that notifies listeners of changes
 *
 * Provides synchronous value access and reactive subscriptions via onChange().
 * Supports implicit coercion for use in conditionals and comparisons.
 *
 * @example
 * ```typescript
 * const wifiStatus = new Observable(false);
 *
 * // Synchronous read
 * console.log(wifiStatus.value); // false
 *
 * // Implicit coercion
 * if (wifiStatus) { ... } // Works via valueOf()
 *
 * // Reactive subscription
 * const cleanup = wifiStatus.onChange((connected) => {
 *   console.log("WiFi:", connected);
 * });
 *
 * // Update (triggers callbacks)
 * wifiStatus.setValue(true);
 *
 * // Cleanup
 * cleanup();
 * ```
 */
export class Observable<T> {
  private _value: T;
  private _listeners: Set<(value: T) => void> = new Set();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  /**
   * Get the current value synchronously
   */
  get value(): T {
    return this._value;
  }

  /**
   * Implicit coercion to primitive value (for conditionals/comparisons)
   */
  valueOf(): T {
    return this._value;
  }

  /**
   * String representation
   */
  toString(): string {
    return String(this._value);
  }

  /**
   * Symbol.toPrimitive for implicit type coercion
   * Allows usage in conditionals: if (observable) { ... }
   */
  [Symbol.toPrimitive](hint: string): T | string {
    if (hint === 'string') {
      return String(this._value);
    }
    return this._value;
  }

  /**
   * Subscribe to value changes
   *
   * The callback is called immediately with the current value,
   * then again whenever setValue() is called with a new value.
   *
   * @param callback - Function to call when value changes
   * @returns Cleanup function to unsubscribe
   *
   * @example
   * ```typescript
   * const cleanup = observable.onChange((value) => {
   *   console.log("New value:", value);
   * });
   *
   * // Later: unsubscribe
   * cleanup();
   * ```
   */
  onChange(callback: (value: T) => void): () => void {
    this._listeners.add(callback);
    // Call immediately with current value
    callback(this._value);
    // Return cleanup function
    return () => this._listeners.delete(callback);
  }

  /**
   * Update the value and notify listeners
   *
   * Only triggers callbacks if the new value is different from current value.
   * Uses strict equality (===) for comparison.
   *
   * @param value - New value to set
   *
   * @internal This method is called by DeviceState when receiving WebSocket updates
   */
  setValue(value: T): void {
    if (this._value !== value) {
      this._value = value;
      // Notify all listeners
      this._listeners.forEach((cb) => {
        try {
          cb(value);
        } catch (error) {
          console.error('Error in Observable onChange callback:', error);
        }
      });
    }
  }

  /**
   * Get the number of active listeners
   * @internal Used for debugging/testing
   */
  get listenerCount(): number {
    return this._listeners.size;
  }
}
