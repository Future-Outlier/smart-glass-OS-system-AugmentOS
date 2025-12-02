import CCIcon from "../assets/icons/path0.svg"
import { CaptionSettings } from "../hooks/useSettings"
import { getLanguageName } from "../lib/languages"

interface HeaderProps {
  connected: boolean
  error: string | null
  settings: CaptionSettings | null
  onUpdateLanguage: (lang: string) => Promise<boolean>
  onUpdateHints: (hints: string[]) => Promise<boolean>
  onUpdateDisplayLines?: (lines: number) => Promise<boolean>
  onUpdateDisplayWidth?: (width: number) => Promise<boolean>
  onToggleLanguageSelector: () => void
  onReconnect: () => void
}

export function Header({ connected, error, settings, onToggleLanguageSelector, onReconnect }: HeaderProps) {
  return (
    <div className="w-full flex flex-col">
      {/* Top header bar */}
      <div
        className="w-full px-6 py-3 backdrop-blur-lg flex justify-center items-center"
        style={{ backgroundColor: "#6DAEA6" }}>
        {/* Title with icon */}
        <div className="flex justify-start items-center gap-2">
          <img src={CCIcon} alt="CC" className="w-7 h-5" />
          <div className="text-center text-white text-lg font-semibold font-['Red_Hat_Display'] leading-7">
            Captions
          </div>
        </div>
      </div>

      {/* Connection error banner */}
      {error && (
        <div className="w-full px-4 py-2 bg-amber-50 border-b border-amber-200 flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="text-amber-800 text-sm font-medium truncate">
              {error}
            </span>
          </div>
          <button
            onClick={onReconnect}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-full flex-shrink-0 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Language selector bar */}
      <div className="w-full px-6 py-3 bg-white rounded-bl-2xl rounded-br-2xl backdrop-blur-lg flex justify-between items-center">
        {settings && (
          <button onClick={onToggleLanguageSelector} className="flex justify-center items-center gap-2">
            {/* Connection status indicator */}
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
              style={connected ? { backgroundColor: "#6DAEA6" } : {}}
              title={connected ? "Connected" : "Disconnected"}
            />
            <div className="text-foreground text-base font-medium font-['Red_Hat_Display'] leading-5">
              {getLanguageName(settings.language)}
            </div>
          </button>
        )}

        {/* Dropdown arrow */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
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
