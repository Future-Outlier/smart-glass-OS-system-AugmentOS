import {Screen} from "@/components/ignite"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"
import {spacing} from "@/theme"

// NOTE: you can't have 2 transition videos in a row or things will break:
const steps: OnboardingStep[] = [
  {
    type: "image",
    name: "Start and stop apps",
    source: require("@assets/onboarding/os/start_app.png"),
    imageContainerClassName: "bg-input pt-11 mx-6 rounded-lg",
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
    type: "image",
    name: "Open an app",
    source: require("@assets/onboarding/os/start_app.png"),
    imageContainerClassName: "bg-input pt-11 mx-6 rounded-lg",
    imageContainerStyle: {
      // backgroundColor: colors.background,
      paddingHorizontal: spacing.s6,
    },
    transition: false,
    bullets: [
      translate("onboarding:osOpenApp"),
      translate("onboarding:osOpenAppBullet1"),
      translate("onboarding:osOpenAppBullet2"),
    ],
  },
  {
    type: "image",
    name: "Background apps",
    source: require("@assets/onboarding/os/start_app.png"),
    imageContainerClassName: "bg-input pt-11 mx-6 rounded-lg",
    imageContainerStyle: {
      paddingHorizontal: spacing.s6,
    },
    transition: false,
    bullets: [
      translate("onboarding:osBackgroundApps"),
      translate("onboarding:osBackgroundAppsBullet1"),
      translate("onboarding:osBackgroundAppsBullet2"),
    ],
  },
  {
    type: "video",
    name: "Action Button Click",
    source: require("@assets/onboarding/live/ONB4_action_button_click.mp4"),
    playCount: 1,
    transition: false,
    bullets: [
      translate("onboarding:osOpenApp"),
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
      <OnboardingGuide steps={steps} autoStart={true} showSkipButton={false} />
    </Screen>
  )
}
