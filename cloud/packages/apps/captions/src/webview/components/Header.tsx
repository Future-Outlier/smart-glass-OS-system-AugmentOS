import {ChevronLeft, Settings} from "lucide-react"
import {Button} from "@/components/ui/button"
import {LanguageModal} from "./LanguageModal"
import {getLanguageName} from "../lib/languages"
import {CaptionSettings} from "../hooks/useSettings"

interface HeaderProps {
  connected: boolean
  settings: CaptionSettings | null
  onUpdateLanguage: (lang: string) => Promise<boolean>
  onUpdateHints: (hints: string[]) => Promise<boolean>
}

export function Header({connected, settings, onUpdateLanguage, onUpdateHints}: HeaderProps) {
  const handleSaveLanguageSettings = async (language: string, hints: string[]) => {
    await onUpdateLanguage(language)
    await onUpdateHints(hints)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <div className="flex items-center gap-3">
        <button className="p-2 -ml-2">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-medium">Live Captions</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />

        {/* Language selector */}
        {settings && (
          <LanguageModal
            currentLanguage={settings.language}
            currentHints={settings.languageHints}
            onSave={handleSaveLanguageSettings}
            trigger={
              <Button variant="ghost" className="text-sm font-medium">
                {getLanguageName(settings.language)}
              </Button>
            }
          />
        )}

        {/* Settings button (future) */}
        <Button variant="ghost" size="icon">
          <Settings className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}
