import {Screen} from "@/components/ignite"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"
import {spacing} from "@/theme"

// NOTE: you can't have 2 transition videos in a row or things will break:
const steps: OnboardingStep[] = [
  {
    type: "image",
    name: "Start Onboarding",
    source: require("@assets/glasses/g1.png"),
    imageContainerStyle: {
      paddingHorizontal: spacing.s6,
    },
    transition: false,
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
  {
    type: "video",
    name: "Action Button Click",
    source: require("@assets/onboarding/live/ONB4_action_button_click.mp4"),
    playCount: 1,
    transition: false,
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
  {
    type: "image",
    name: "Unknown Wearable",
    transition: false,
    source: require("@assets/glasses/unknown_wearable.png"),
    imageContainerStyle: {
      paddingHorizontal: spacing.s6,
    },
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
  {
    name: "Action Button Click",
    type: "video",
    transition: false,
    playCount: 1,
    source: require("@assets/onboarding/live/ONB4_action_button_click.mp4"),
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
  {
    name: "Unknown Wearable",
    type: "image",
    transition: false,
    source: require("@assets/glasses/unknown_wearable.png"),
    imageContainerStyle: {
      paddingHorizontal: spacing.s6,
    },
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
]

export default function MentraOSOnboarding() {
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <OnboardingGuide steps={steps} autoStart={true} />
    </Screen>
  )
}
