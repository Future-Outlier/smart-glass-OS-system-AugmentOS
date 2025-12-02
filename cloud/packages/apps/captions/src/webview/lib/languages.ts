export interface Language {
  code: string
  name: string
  nativeName?: string
}

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "sq", name: "Albanian", nativeName: "Shqip" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycan" },
  { code: "eu", name: "Basque", nativeName: "Euskara" },
  { code: "be", name: "Belarusian", nativeName: "Беларуская" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "bs", name: "Bosnian", nativeName: "Bosanski" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "ca", name: "Catalan", nativeName: "Català" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "et", name: "Estonian", nativeName: "Eesti" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "gl", name: "Galician", nativeName: "Galego" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақ тілі" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "sr", name: "Serbian", nativeName: "Српски" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "cy", name: "Welsh", nativeName: "Cymraeg" },
]

export function getLanguageName(code: string): string {
  return AVAILABLE_LANGUAGES.find((l) => l.code === code)?.name || code
}

export function searchLanguages(query: string): Language[] {
  const lowerQuery = query.toLowerCase()
  return AVAILABLE_LANGUAGES.filter(
    (l) => l.name.toLowerCase().includes(lowerQuery) || l.code.toLowerCase().includes(lowerQuery),
  )
}

export function getAvailableHints(primaryLanguage: string): Language[] {
  // Return all languages except the primary language for use as hints
  return AVAILABLE_LANGUAGES.filter((l) => l.code !== primaryLanguage)
}

export function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("-")
    .pop()!
    .split("")
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
