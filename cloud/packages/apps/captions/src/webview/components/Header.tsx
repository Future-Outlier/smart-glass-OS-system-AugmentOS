import {Button} from "@/components/ui/button"
import {CaptionSettings} from "@/hooks/useSettings"
import {getLanguageName} from "@/lib/languages"

import {LanguageModal} from "./LanguageModal"
import {SettingsModal} from "./SettingsModal"

interface HeaderProps {
  connected: boolean
  settings: CaptionSettings | null
  onUpdateLanguage: (lang: string) => Promise<boolean>
  onUpdateHints: (hints: string[]) => Promise<boolean>
  onUpdateDisplayLines: (lines: number) => Promise<boolean>
  onUpdateDisplayWidth: (width: number) => Promise<boolean>
}

export function Header({
  connected,
  settings,
  onUpdateLanguage,
  onUpdateHints,
  onUpdateDisplayLines,
  onUpdateDisplayWidth,
}: HeaderProps) {
  const handleSaveLanguageSettings = async (language: string, hints: string[]) => {
    await onUpdateLanguage(language)
    await onUpdateHints(hints)
  }

  const handleSaveDisplaySettings = async (lines: number, width: number) => {
    await onUpdateDisplayLines(lines)
    await onUpdateDisplayWidth(width)
  }

  return (
    <div className="flex items-center justify-end px-4 py-3 border-b">
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

        {/* Settings button */}
        {settings && (
          <SettingsModal
            currentLines={settings.displayLines}
            currentWidth={settings.displayWidth}
            onSave={handleSaveDisplaySettings}
            trigger={
              <Button variant="ghost" className="text-sm font-medium">
                Settings
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}
