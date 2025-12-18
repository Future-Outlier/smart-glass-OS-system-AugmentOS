// import {Image} from "expo-image"
// import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
// import {useAppTheme} from "@/contexts/ThemeContext"
// import {View} from "react-native"

import {Screen} from "@/components/ignite"
import {translate} from "@/i18n"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {spacing} from "@/theme"

// NOTE: you can't have 2 transition videos in a row or things will break:
const steps: OnboardingStep[] = [
  {
    type: "image",
    source: require("@assets/glasses/g1.png"),
    imageContainerStyle: {
      paddingHorizontal: spacing.s6,
    },
    // imageComponent: () => {
    //   return (
    //     <View className="">
    //       <Image
    //         source={require("@assets/glasses/g1.png")}
    //         style={{width: "100%", height: "100%"}}
    //         contentFit="contain"
    //       />
    //     </View>
    //   )
    // },
    name: "Start Onboarding",
    transition: false,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
    bullets: [
      translate("onboarding:osStartStopApps"),
      translate("onboarding:osStartStopAppsBullet1"),
      translate("onboarding:osStartStopAppsBullet2"),
    ],
  },
  {
    type: "video",
    source: require("@assets/onboarding/live/ONB4_action_button_click.mp4"),
    name: "Start Onboarding",
    playCount: 1,
    transition: false,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
  },
  {
    type: "video",
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
