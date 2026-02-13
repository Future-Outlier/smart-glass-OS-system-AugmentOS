import {useEffect, createContext} from "react"
import {View} from "react-native"
import {useInstalledLmas} from "@/stores/applets"
import LocalMiniApp from "@/components/home/LocalMiniApp"

function Compositor() {
  const lmas = useInstalledLmas()

  useEffect(() => {
    console.log(
      "Lmas:",
      lmas.map((lma) => lma.packageName),
    )
  }, [lmas])

  const renderLmas = () => {
    return lmas.map((lma) => {
      return <LocalMiniApp key={lma.packageName} url={lma.webviewUrl} />
    })
  }

  return <View className="flex-1 absolute bottom-0">{renderLmas()}</View>
}

type CompositorContextType = {}

const CompositorContext = createContext<CompositorContextType | null>(null)
export default function CompositorProvider({children}: {children: React.ReactNode}) {
  return (
    <CompositorContext.Provider value={{}}>
      {children}
      <Compositor />
    </CompositorContext.Provider>
  )
}
