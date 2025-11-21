// @ts-nocheck
import {createMMKV} from "react-native-mmkv"
import {result as Res, Result} from "typesafe-ts"
class MMKVStorage {
  private _store?: MMKV

  private get store(): MMKV {
    if (!this._store) {
      this._store = createMMKV()
    }
    return this._store
  }

  public save(key: string, value: unknown): Result<void, Error> {
    return this.saveString(key, JSON.stringify(value))
  }

  public load<T>(key: string): Result<T, Error> {
    let almostThere: string | null = null
    try {
      almostThere = this.loadString(key)
      let value: T = JSON.parse(almostThere ?? "") as T
      // @ts-ignore
      return Res.ok(value)
    } catch {
      return Res.error(new Error(`Failed to load ${key}`))
    }
  }

  private loadString(key: string): string | null {
    return this.store.getString(key) ?? null
  }

  private saveString(key: string, value: string): Result<void, Error> {
    this.store.set(key, value)
    return Res.ok(undefined)
  }

  public loadSubKeys(key: string): Result<Record<string, unknown>, Error> {
    return Res.try(() => {
      // return the key value pair of any keys that start with the given key and contain a colon:
      const keys = this.store.getAllKeys()

      const subKeys = keys.filter(key => key.startsWith(key) && key.includes(":"))

      if (subKeys.length === 0) {
        return Res.error(new Error(`No subkeys found for ${key}`))
      }

      let subKeysObject: Record<string, unknown> = {}

      for (const subKey of subKeys) {
        const res = this.load(subKey)
        if (res.is_ok()) {
          subKeysObject[subKey] = res.value
        }
      }

      return subKeysObject
    })
  }

  // burn it all:
  public clearAll(): Result<void, Error> {
    this.store.clearAll()
    return Res.ok(undefined)
  }
}

export const storage = new MMKVStorage()
