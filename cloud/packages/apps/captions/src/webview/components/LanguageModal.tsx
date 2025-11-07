import {useState, useEffect} from "react"
import {Button} from "@/components/ui/button"
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {AVAILABLE_LANGUAGES, getLanguageName as _, getAvailableHints} from "../lib/languages"

interface LanguageModalProps {
  currentLanguage: string
  currentHints: string[]
  onSave: (language: string, hints: string[]) => Promise<void>
  trigger: React.ReactNode
}

export function LanguageModal({currentLanguage, currentHints, onSave, trigger}: LanguageModalProps) {
  const [open, setOpen] = useState(false)
  const [tempLanguage, setTempLanguage] = useState(currentLanguage)
  const [tempHints, setTempHints] = useState<string[]>(currentHints)
  const [saving, setSaving] = useState(false)

  // Reset temp state when modal opens
  useEffect(() => {
    if (open) {
      setTempLanguage(currentLanguage)
      setTempHints(currentHints)
    }
  }, [open, currentLanguage, currentHints])

  const toggleHint = (code: string) => {
    setTempHints((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(tempLanguage, tempHints)
      setOpen(false)
    } catch (error) {
      console.error("Failed to save language settings:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setOpen(false)
  }

  const availableHints = getAvailableHints(tempLanguage)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Language Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Primary Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Language</label>
            <Select value={tempLanguage} onValueChange={setTempLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language Hints */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Language Hints (Optional)</label>
            <p className="text-xs text-gray-500">Select languages that might appear in conversation</p>
            <div className="flex flex-wrap gap-2 pt-2 max-h-48 overflow-y-auto">
              {availableHints.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => toggleHint(lang.code)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    tempHints.includes(lang.code)
                      ? "bg-green-100 text-green-800 border-2 border-green-500"
                      : "bg-gray-100 text-gray-700 border-2 border-transparent hover:border-gray-300"
                  }`}>
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-black hover:bg-gray-800" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
