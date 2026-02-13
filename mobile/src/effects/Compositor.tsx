import {useEffect} from "react"
import {View} from "react-native"
import {useLocalMiniApps} from "@/stores/applets"
import LocalMiniApp from "@/components/home/LocalMiniApp"

function Compositor() {
  const lmas = useLocalMiniApps()

  // useEffect(() => {
  //   console.log(
  //     "Lmas:",
  //     lmas.map((lma) => lma.packageName),
  //   )
  // }, [lmas])

  const renderLmas = () => {
    return lmas.map((lma) => {
      return <LocalMiniApp key={lma.packageName} url={lma.webviewUrl} packageName={lma.packageName} />
    })
  }

  return <View className="flex-1 absolute bottom-0">{renderLmas()}</View>
}

export default Compositor