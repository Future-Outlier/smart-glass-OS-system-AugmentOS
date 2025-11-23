// SelectWithSearchSetting.tsx
import {useState, useMemo, useEffect} from "react"
import {
  View,
  TextInput,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import SearchIcon from "@/assets/icons/component/SearchIcon"
import {Icon, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"

type Option = {
  label: string
  value: string
}

type SelectWithSearchSettingProps = {
  label: string
  value: string
  options: Option[]
  onValueChange: (value: string) => void
  defaultValue?: string
}

const SelectWithSearchSetting = ({
  label,
  value,
  options,
  onValueChange,
  defaultValue,
}: SelectWithSearchSettingProps) => {
  const {theme} = useAppTheme()

  const [search, setSearch] = useState("")
  const [modalVisible, setModalVisible] = useState(false)

  // If the current value doesn't match any option, use the defaultValue
  useEffect(() => {
    if (options.length > 0 && !options.find(option => option.value === value)) {
      // Value doesn't match any option
      if (defaultValue !== undefined && options.find(option => option.value === defaultValue)) {
        // Default value exists and is valid, use it
        onValueChange(defaultValue)
      }
    }
  }, [value, options, defaultValue, onValueChange])

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!search) return options
    return options.filter(option => option.label.toLowerCase().includes(search.toLowerCase()))
  }, [search, options])

  const selectedLabel = options.find(option => option.value === value)?.label || "Select..."

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.selectRow,
          {
            backgroundColor: theme.colors.backgroundAlt,
            borderRadius: theme.spacing.s4,
            borderWidth: theme.spacing.s0_5,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.s4,
            paddingHorizontal: theme.spacing.s6 - theme.spacing.s1, // 20px
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}>
        <Text style={[styles.label, {color: theme.colors.text}]}>{label}</Text>
        <View style={styles.valueContainer}>
          <Text style={[styles.selectText, {color: theme.colors.textDim}]}>{selectedLabel}</Text>
          <Icon icon="caretRight" size={16} color={theme.colors.textDim} style={styles.chevron} />
        </View>
      </TouchableOpacity>
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        style={{flex: 1}}
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.modalContent,
                    {
                      backgroundColor: theme.colors.backgroundAlt,
                      borderColor: theme.colors.border,
                      borderWidth: theme.spacing.s0_5,
                      padding: theme.spacing.s4,
                      borderRadius: theme.spacing.s4,
                      shadowRadius: theme.spacing.s2,
                    },
                  ]}>
                  <View style={[styles.modalHeader, {marginBottom: theme.spacing.s3}]}>
                    <Text style={[styles.modalLabel, {color: theme.colors.textDim}]}>{label}</Text>
                  </View>
                  <View
                    style={[
                      styles.searchContainer,
                      {
                        borderColor: theme.colors.inputBorderHighlight,
                        backgroundColor: theme.colors.backgroundAlt,
                        borderRadius: 100, // Pill shape
                        marginBottom: theme.spacing.s3,
                        paddingHorizontal: theme.spacing.s3,
                        paddingVertical: theme.spacing.s2,
                      },
                    ]}>
                    <SearchIcon size={20} color={theme.colors.textDim} />
                    <TextInput
                      style={[
                        styles.searchInput,
                        {
                          color: theme.colors.text,
                          flex: 1,
                          marginHorizontal: theme.spacing.s2,
                        },
                      ]}
                      placeholder="Search"
                      placeholderTextColor={theme.colors.textDim}
                      value={search}
                      onChangeText={setSearch}
                      autoFocus
                    />
                    {search.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSearch("")}
                        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                        <MaterialCommunityIcons name="close" size={20} color={theme.colors.textDim} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <FlatList
                    data={filteredOptions}
                    keyExtractor={item => item.value}
                    keyboardShouldPersistTaps="always"
                    style={styles.optionsList}
                    renderItem={({item}) => (
                      <Pressable
                        style={[
                          styles.optionItem,
                          {
                            paddingVertical: theme.spacing.s3,
                            paddingRight: theme.spacing.s4,
                          },
                        ]}
                        onPress={() => {
                          onValueChange(item.value)
                          setModalVisible(false)
                          setSearch("")
                        }}>
                        {item.value === value ? (
                          <MaterialCommunityIcons name="check" size={24} color={theme.colors.primary} />
                        ) : (
                          <View style={{width: 24, height: 24}} />
                        )}
                        <Text
                          style={[
                            styles.optionText,
                            {color: theme.colors.text, flex: 1, marginLeft: theme.spacing.s2},
                          ]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    )}
                    ListEmptyComponent={
                      <Text style={[styles.emptyText, {color: theme.colors.text + "99"}]}>No options found</Text>
                    }
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = {
  chevron: {
    marginLeft: 2,
  },
  container: {
    width: "100%",
  },
  emptyText: {
    fontSize: 15,
    marginTop: 20,
    textAlign: "center",
  },
  label: {
    flex: 1,
    fontSize: 15,
  },
  modalContent: {
    elevation: 5,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    width: "90%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: "normal",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "center",
  },
  optionItem: {
    alignItems: "center",
    flexDirection: "row",
    paddingLeft: 0,
  },
  optionText: {
    fontSize: 16,
  },
  optionsList: {
    flexGrow: 0,
    maxHeight: 250,
  },
  searchContainer: {
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
  },
  searchInput: {
    fontSize: 16,
    paddingVertical: 0, // Remove default padding
  },
  selectRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectText: {
    fontSize: 15,
  },
  valueContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
} as const

export default SelectWithSearchSetting
