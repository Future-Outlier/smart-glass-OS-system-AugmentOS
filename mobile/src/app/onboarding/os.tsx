import {Screen} from "@/components/ignite"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import {useCallback} from "react"

const CDN_BASE = "https://mentra-videos-cdn.mentraglass.com/onboarding/mentraos/light"

export default function MentraOSOnboarding() {
  const {pushPrevious} = useNavigationHistory()
  const [_onboardingOsCompleted, setOnboardingOsCompleted] = useSetting(SETTINGS.onboarding_os_completed.key)
  // focusEffectPreventBack()

  // NOTE: you can't have 2 transition videos in a row or things will break:
  const steps: OnboardingStep[] = [
    {
      type: "video",
      name: "Welcome",
      source: `${CDN_BASE}/start_stop_apps.mp4`,
      poster: require("@assets/onboarding/os/thumbnails/start_stop_apps.jpg"),
      containerClassName: "bg-background",
      transition: false,
      playCount: 1,
      title: translate("onboarding:osWelcomeTitle"),
      subtitle: translate("onboarding:osWelcomeSubtitle"),
    },
    {
      type: "video",
      name: "Start and stop apps",
      source: `${CDN_BASE}/start_stop_apps.mp4`,
      poster: require("@assets/onboarding/os/thumbnails/start_stop_apps.jpg"),
      containerClassName: "bg-background",
      transition: false,
      playCount: 2,
      bullets: [
        translate("onboarding:osStartStopApps"),
        translate("onboarding:osStartStopAppsBullet1"),
        translate("onboarding:osStartStopAppsBullet2"),
      ],
    },
    {
      type: "video",
      name: "Open an app",
      source: `${CDN_BASE}/open_an_app.mp4`,
      poster: require("@assets/onboarding/os/thumbnails/open_an_app.jpg"),
      containerClassName: "bg-background",
      transition: false,
      playCount: 2,
      bullets: [
        translate("onboarding:osOpenApp"),
        translate("onboarding:osOpenAppBullet1"),
        translate("onboarding:osOpenAppBullet2"),
      ],
    },
    {
      type: "video",
      name: "Background apps",
      source: `${CDN_BASE}/background_apps.mp4`,
      poster: require("@assets/onboarding/os/thumbnails/background_apps.jpg"),
      containerClassName: "bg-background",
      transition: false,
      playCount: 2,
      bullets: [
        translate("onboarding:osBackgroundApps"),
        translate("onboarding:osBackgroundAppsBullet1"),
        translate("onboarding:osBackgroundAppsBullet2"),
      ],
    },
    {
      type: "video",
      name: "Foreground and Background Apps",
      source: `${CDN_BASE}/foreground_background_apps.mov`,
      poster: require("@assets/onboarding/os/thumbnails/background_apps.jpg"),
      containerClassName: "bg-background",
      transition: false,
      playCount: 2,
      bullets: [
        translate("onboarding:osForegroundAndBackgroundApps"),
        translate("onboarding:osForegroundAndBackgroundAppsBullet1"),
        translate("onboarding:osForegroundAndBackgroundAppsBullet2"),
      ],
    },
    // {
    //   type: "video",
    //   name: "Mentra AI",
    //   source: `${CDN_BASE}/mentra_ai.mov`,
    //   containerClassName: "bg-background",
    //   transition: false,
    //   playCount: 2,
    //   bullets: [
    //     translate("onboarding:osMentraAi"),
    //     translate("onboarding:osMentraAiBullet1"),
    //     translate("onboarding:osMentraAiBullet2"),
    //   ],
    // },
    //     {
    //   type: "video",
    //   name: "end",
    //   //source: `${CDN_BASE}/mentra_ai.mov`,
    //   source: `${CDN_BASE}/mentraos_onboard_end.mp4`,
    //   containerClassName: "bg-background",
    //   transition: false,
    //   playCount: 99999,//2,
    //   replayable: true,
    //   title: translate("onboarding:osEndTitle"),
    //   subtitle: translate("onboarding:osEndSubtitle"),
    // },
    // {
    //   type: "image",
    //   name: "end",
    //   // containerClassName: "bg-background",
    //   transition: false,
    //   title: translate("onboarding:osEndTitle"),
    //   subtitle: translate("onboarding:osEndSubtitle"),
    // },
  ]

  const handleCloseButton = () => {
    showAlert(translate("onboarding:osEndOnboardingTitle"), translate("onboarding:osEndOnboardingMessage"), [
      {text: translate("common:cancel"), onPress: () => {}},
      {
        text: translate("common:exit"),
        onPress: () => {
          handleExit()
        },
      },
    ])
  }

  const handleExit = () => {
    // setOnboardingOsCompleted(true)
    pushPrevious()
  }

  const handleEndButton = () => {
    setOnboardingOsCompleted(true)
    pushPrevious()
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <OnboardingGuide
        steps={steps}
        autoStart={true}
        showCloseButton={true}
        preventBack={true}
        skipFn={handleCloseButton}
        endButtonFn={handleEndButton}
        startButtonText={translate("onboarding:continueOnboarding")}
        endButtonText={translate("common:continue")}
      />
    </Screen>
  )
}
