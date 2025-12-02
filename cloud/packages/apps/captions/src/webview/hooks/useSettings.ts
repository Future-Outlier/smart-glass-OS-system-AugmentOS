import { useState, useEffect } from "react"

export interface CaptionSettings {
  language: string
  languageHints: string[]
  displayLines: number
  displayWidth: number
}

export function useSettings() {
  const [settings, setSettings] = useState<CaptionSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    // Mock data for UI development
    setSettings({
      language: "en",
      languageHints: [],
      displayLines: 3,
      displayWidth: 1,
    })
    setLoading(false)
    setError(null)
  }

  const updateLanguage = async (language: string) => {
    try {
      const response = await fetch("/api/settings/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      })

      if (response.ok) {
        setSettings((prev) => (prev ? { ...prev, language } : null))
        return true
      }
      return false
    } catch (err) {
      console.error("Failed to update language:", err)
      return false
    }
  }

  const updateHints = async (hints: string[]) => {
    try {
      const response = await fetch("/api/settings/language-hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hints }),
      })

      if (response.ok) {
        setSettings((prev) => (prev ? { ...prev, languageHints: hints } : null))
        return true
      }
      return false
    } catch (err) {
      console.error("Failed to update language hints:", err)
      return false
    }
  }

  const updateDisplayLines = async (lines: number) => {
    try {
      const response = await fetch("/api/settings/display-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      })

      if (response.ok) {
        setSettings((prev) => (prev ? { ...prev, displayLines: lines } : null))
        return true
      }
      return false
    } catch (err) {
      console.error("Failed to update display lines:", err)
      return false
    }
  }

  const updateDisplayWidth = async (width: number) => {
    try {
      const response = await fetch("/api/settings/display-width", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width }),
      })

      if (response.ok) {
        setSettings((prev) => (prev ? { ...prev, displayWidth: width } : null))
        return true
      }
      return false
    } catch (err) {
      console.error("Failed to update display width:", err)
      return false
    }
  }

  return {
    settings,
    loading,
    error,
    updateLanguage,
    updateHints,
    updateDisplayLines,
    updateDisplayWidth,
    refetch: fetchSettings,
  }
}
