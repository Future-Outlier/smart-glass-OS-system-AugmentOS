import {Header, Screen, Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {View} from "react-native"
import {DraggableMasonryList} from "react-native-draggable-masonry"

export default function LayoutSettingsScreen() {
  const {goBack} = useNavigationHistory()

  const data = [
    {id: "1", height: 100, title: "Item 1"},
    {id: "2", height: 150, title: "Item 2"},
    {id: "3", height: 120, title: "Item 3"},
  ]

  return (
    <Screen preset="fixed">
      <Header title="Layout Settings" leftIcon="chevron-left" onLeftPress={() => goBack()} />

      <DraggableMasonryList
        data={data}
        renderItem={({item}) => (
          <View style={{height: item.height, backgroundColor: "#f0f0f0"}}>
            <Text>{item.title}</Text>
          </View>
        )}
        columns={2}
        onDragEnd={({data}) => console.log("New order:", data)}
      />
    </Screen>
  )
}
