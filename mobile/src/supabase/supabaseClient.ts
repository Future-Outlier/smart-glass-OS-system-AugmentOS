// supabaseClient.ts
import {createClient, SupportedStorage} from "@supabase/supabase-js"

import {storage} from "@/utils/storage"

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL as string) || "https://auth.mentra.glass"
const SUPABASE_ANON_KEY =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYml1bnpmYmJ0d2x6ZHBybWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQyODA2OTMsImV4cCI6MjA0OTg1NjY5M30.rbEsE8IRz-gb3-D0H8VAJtGw-xvipl1Nc-gCnnQ748U"

// write a shim to mmkv storage:

class SupabaseStorage implements SupportedStorage {
  getItem(key: string): any {
    return storage.load<any>(key)
  }
  setItem(key: string, value: string): void {
    storage.save(key, value)
  }
  removeItem(key: string): void {
    storage.remove(key)
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: new SupabaseStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
