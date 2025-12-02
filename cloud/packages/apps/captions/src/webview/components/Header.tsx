import ArrowLeftIcon from "@/assets/icons/arrow-left.svg"
import CCIcon from "@/assets/icons/path0.svg"
import { CaptionSettings } from "@/hooks/useSettings"
import { getLanguageName } from "@/lib/languages"

import { LanguageModal } from "./LanguageModal"

interface HeaderProps {
  connected: boolean
  settings: CaptionSettings | null
  onUpdateLanguage: (lang: string) => Promise<boolean>
  onUpdateHints: (hints: string[]) => Promise<boolean>
  onUpdateDisplayLines?: (lines: number) => Promise<boolean>
  onUpdateDisplayWidth?: (width: number) => Promise<boolean>
}

export function Header({ connected, settings, onUpdateLanguage, onUpdateHints }: HeaderProps) {
  const handleSaveLanguageSettings = async (language: string, hints: string[]) => {
    await onUpdateLanguage(language)
    await onUpdateHints(hints)
  }

  return (
    <div className="w-full flex flex-col">
      {/* Top header bar */}
      <div
        className="w-full px-6 py-3 backdrop-blur-lg flex justify-between items-center"
        style={{ backgroundColor: "#6DAEA6" }}>
        {/* Back button */}
        <button className="p-2 bg-white rounded-[32px] flex justify-start items-center gap-2">
          <img src={ArrowLeftIcon} alt="Back" className="w-6 h-6 rotate-180" />
        </button>

        {/* Title with icon */}
        <div className="flex justify-start items-center gap-2">
          <img src={CCIcon} alt="CC" className="w-7 h-5" />
          <div className="text-center text-white text-lg font-semibold font-['Red_Hat_Display'] leading-7">
            Captions
          </div>
        </div>

        {/* Right spacer */}
        <div className="w-10 h-10" />
      </div>

      {/* Language selector bar */}
      <div className="w-full px-6 py-3 bg-white rounded-bl-2xl rounded-br-2xl backdrop-blur-lg flex justify-between items-center">
        {settings && (
          <LanguageModal
            currentLanguage={settings.language}
            currentHints={settings.languageHints}
            onSave={handleSaveLanguageSettings}
            trigger={
              <button className="flex justify-center items-center gap-2">
                {/* Connection status indicator */}
                <div
                  className={`w-2 h-2 rounded-full ${connected ? "bg-red-500" : "bg-red-500"}`}
                  style={connected ? { backgroundColor: "#6DAEA6" } : {}}
                />
                <div className="text-foreground text-base font-medium font-['Red_Hat_Display'] leading-5">
                  {getLanguageName(settings.language)}
                </div>
              </button>
            }
          />
        )}

        {/* Dropdown arrow */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="-rotate-90"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 9L12 15L18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          />
        </svg>
      </div>
    </div>
  )
}
