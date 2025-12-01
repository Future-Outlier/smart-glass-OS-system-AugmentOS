import CaptionsIcon from "@/assets/icons/captions.svg"
import SettingsIcon from "@/assets/icons/settings.svg"

interface BottomNavProps {
  activeTab?: "captions" | "settings"
  onTabChange?: (tab: "captions" | "settings") => void
}

export function BottomNav({activeTab = "captions", onTabChange}: BottomNavProps) {
  return (
    <div className="w-96 h-14 py-3 bg-white/80 rounded-tl-2xl rounded-tr-2xl backdrop-blur-lg flex flex-col justify-start items-center gap-2.5 overflow-hidden">
      <div className="self-stretch inline-flex justify-center items-end">
        {/* Captions tab */}
        <div className="flex-1 inline-flex flex-col justify-start items-center gap-1">
          <button
            onClick={() => onTabChange?.("captions")}
            className={`w-12 h-7 p-2 rounded-3xl inline-flex justify-center items-center gap-2 transition-colors ${
              activeTab === "captions" ? "bg-slate-400" : "bg-transparent"
            }`}>
            <img
              src={CaptionsIcon}
              alt="Captions"
              className={`w-6 h-6 ${activeTab === "captions" ? "brightness-0 invert" : "opacity-60"}`}
            />
          </button>
        </div>

        {/* Settings tab */}
        <div className="flex-1 inline-flex flex-col justify-start items-center gap-1">
          <button
            onClick={() => onTabChange?.("settings")}
            className="h-7 p-2 rounded-xl inline-flex justify-start items-center gap-2">
            <img src={SettingsIcon} alt="Settings" className="w-6 h-6 opacity-60" />
          </button>
        </div>
      </div>
    </div>
  )
}
