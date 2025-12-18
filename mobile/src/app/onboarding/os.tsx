import {Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"

// NOTE: you can't have 2 transition videos in a row or things will break:
const steps: OnboardingStep[] = [
  {
    source: require("@assets/glasses/g1.png"),
    name: "Start Onboarding",
    playCount: 1,
    transition: false,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
    bullets: [
        translate("onboarding:osStartStopApps"),
        translate("onboarding:osStartStopAppsBullet1"),
        translate("onboarding:osStartStopAppsBullet2"),
    ]
  },
  {
    source: require("@assets/onboarding/live/ONB4_action_button_click.mp4"),
    name: "Start Onboarding",
    playCount: 1,
    transition: false,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
  },
  {
    source: require("@assets/onboarding/live/ONB7_trackpad_tap.mp4"),
    name: "Start Onboarding",
    playCount: 1,
    transition: false,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
  },
]

export default function MentraOSOnboarding() {
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <OnboardingGuide steps={steps} autoStart={true} />
    </Screen>
  )
}
