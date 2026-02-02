import React, {useCallback, useEffect} from "react"
import {View, Text, Image, Dimensions, Pressable, StyleSheet} from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  useAnimatedScrollHandler,
  useDerivedValue,
} from "react-native-reanimated"
import {Gesture, GestureDetector, GestureHandlerRootView} from "react-native-gesture-handler"

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get("window")
const CARD_WIDTH = SCREEN_WIDTH * 0.72
const CARD_HEIGHT = SCREEN_HEIGHT * 0.55
const CARD_SPACING = 16
const DISMISS_THRESHOLD = -120
const VELOCITY_THRESHOLD = -800

interface AppCard {
  id: string
  name: string
  screenshot?: string
  icon?: string
  color?: string
}

interface AppCardItemProps {
  app: AppCard
  index: number
  activeIndex: Animated.SharedValue<number>
  onDismiss: (id: string) => void
  onSelect: (id: string) => void
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function AppCardItem({app, index, activeIndex, onDismiss, onSelect}: AppCardItemProps) {
  const translateY = useSharedValue(0)
  const cardOpacity = useSharedValue(1)
  const cardScale = useSharedValue(1)

  const dismissCard = useCallback(() => {
    onDismiss(app.id)
  }, [app.id, onDismiss])

  const selectCard = useCallback(() => {
    onSelect(app.id)
  }, [app.id, onSelect])

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only allow upward swipes
      translateY.value = Math.min(0, event.translationY)
      
      // Scale down slightly as card moves up
      const progress = Math.abs(translateY.value) / DISMISS_THRESHOLD
      cardScale.value = interpolate(progress, [0, 1], [1, 0.95], Extrapolation.CLAMP)
      cardOpacity.value = interpolate(progress, [0, 1, 2], [1, 0.8, 0], Extrapolation.CLAMP)
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value < DISMISS_THRESHOLD || event.velocityY < VELOCITY_THRESHOLD

      if (shouldDismiss) {
        translateY.value = withTiming(-SCREEN_HEIGHT, {duration: 250})
        cardOpacity.value = withTiming(0, {duration: 200}, () => {
          runOnJS(dismissCard)()
        })
      } else {
        translateY.value = withSpring(0, {damping: 15, stiffness: 200})
        cardScale.value = withSpring(1)
        cardOpacity.value = withSpring(1)
      }
    })

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(selectCard)()
  })

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture)

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index - activeIndex.value)
    
    // 3D perspective effect
    const rotateY = interpolate(
      activeIndex.value,
      [index - 1, index, index + 1],
      [25, 0, -25],
      Extrapolation.CLAMP
    )

    const scale = interpolate(
      distance,
      [0, 1, 2],
      [1, 0.92, 0.85],
      Extrapolation.CLAMP
    )

    const opacity = interpolate(
      distance,
      [0, 2, 3],
      [1, 0.7, 0.4],
      Extrapolation.CLAMP
    )

    return {
      transform: [
        {perspective: 1000},
        {translateY: translateY.value},
        {scale: cardScale.value * scale},
        {rotateY: `${rotateY}deg`},
      ],
      opacity: cardOpacity.value * opacity,
    }
  })

  const bgColor = app.color || "#374151"

  return (
    <GestureDetector gesture={composedGesture}>
      <AnimatedPressable
        style={[
          styles.card,
          {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            marginHorizontal: CARD_SPACING / 2,
          },
          cardAnimatedStyle,
        ]}
      >
        {/* Card Container with shadow */}
        <View style={styles.cardInner}>
          {/* App Screenshot/Preview Area */}
          <View style={[styles.screenshotArea, {backgroundColor: bgColor}]}>
            {app.screenshot ? (
              <Image
                source={{uri: app.screenshot}}
                style={styles.screenshot}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderContent}>
                <Text style={styles.placeholderLetter}>{app.name.charAt(0)}</Text>
              </View>
            )}
            
            {/* Status bar mockup */}
            <View style={styles.statusBar}>
              <Text style={styles.statusTime}>9:41</Text>
            </View>
          </View>

          {/* Swipe indicator */}
          <View style={styles.swipeIndicator}>
            <View style={styles.swipeBar} />
          </View>
        </View>

        {/* App Label Below Card */}
        <View style={styles.appLabelContainer}>
          {app.icon ? (
            <Image source={{uri: app.icon}} style={styles.appIcon} />
          ) : (
            <View style={[styles.appIconPlaceholder, {backgroundColor: bgColor}]}>
              <Text style={styles.appIconLetter}>{app.name.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.appName} numberOfLines={1}>
            {app.name}
          </Text>
        </View>
      </AnimatedPressable>
    </GestureDetector>
  )
}

interface AppSwitcherProps {
  visible: boolean
  onClose: () => void
  apps: AppCard[]
  onAppSelect: (id: string) => void
  onAppDismiss: (id: string) => void
}

export default function AppSwitcher({
  visible,
  onClose,
  apps,
  onAppSelect,
  onAppDismiss,
}: AppSwitcherProps) {
  const translateX = useSharedValue(0)
  const activeIndex = useSharedValue(0)
  const backdropOpacity = useSharedValue(0)
  const containerTranslateY = useSharedValue(100)
  const containerOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, {duration: 250})
      containerTranslateY.value = withSpring(0, {damping: 20, stiffness: 100})
      containerOpacity.value = withTiming(1, {duration: 200})
      // Reset scroll position
      translateX.value = 0
      activeIndex.value = 0
    } else {
      backdropOpacity.value = withTiming(0, {duration: 200})
      containerTranslateY.value = withTiming(100, {duration: 200})
      containerOpacity.value = withTiming(0, {duration: 150})
    }
  }, [visible])

  // Update active index based on scroll position
  useDerivedValue(() => {
    activeIndex.value = -translateX.value / (CARD_WIDTH + CARD_SPACING)
  })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{translateY: containerTranslateY.value}],
    opacity: containerOpacity.value,
  }))

  const cardsContainerStyle = useAnimatedStyle(() => ({
    transform: [{translateX: translateX.value}],
  }))

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      const newTranslateX = event.translationX
      const maxTranslate = 0
      const minTranslate = -((apps.length - 1) * (CARD_WIDTH + CARD_SPACING))
      
      // Add rubber band effect at edges
      if (newTranslateX > maxTranslate) {
        translateX.value = newTranslateX * 0.3
      } else if (newTranslateX < minTranslate) {
        translateX.value = minTranslate + (newTranslateX - minTranslate) * 0.3
      } else {
        translateX.value = newTranslateX
      }
    })
    .onEnd((event) => {
      const cardWidth = CARD_WIDTH + CARD_SPACING
      const velocity = event.velocityX
      
      // Determine target index based on velocity and position
      let targetIndex = Math.round(-translateX.value / cardWidth)
      
      if (Math.abs(velocity) > 500) {
        targetIndex = velocity > 0 ? targetIndex - 1 : targetIndex + 1
      }
      
      // Clamp to valid range
      targetIndex = Math.max(0, Math.min(targetIndex, apps.length - 1))
      
      translateX.value = withSpring(-targetIndex * cardWidth, {
        damping: 20,
        stiffness: 90,
        velocity: velocity,
      })
    })

  const handleDismiss = useCallback(
    (id: string) => {
      onAppDismiss(id)
    },
    [onAppDismiss]
  )

  const handleSelect = useCallback(
    (id: string) => {
      onAppSelect(id)
      onClose()
    },
    [onAppSelect, onClose]
  )

  if (!visible && containerOpacity.value === 0) {
    return null
  }

  return (
    <View style={styles.overlay} pointerEvents={visible ? "auto" : "none"}>
      {/* Blurred Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Main Container */}
      <Animated.View style={[styles.container, containerStyle]}>
        {/* Header hint */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Swipe up to close apps</Text>
        </View>

        {/* Cards Carousel */}
        {apps.length > 0 ? (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.carouselContainer}>
              <Animated.View
                style={[
                  styles.cardsRow,
                  {
                    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 - CARD_SPACING / 2,
                  },
                  cardsContainerStyle,
                ]}
              >
                {apps.map((app, index) => (
                  <AppCardItem
                    key={app.id}
                    app={app}
                    index={index}
                    activeIndex={activeIndex}
                    onDismiss={handleDismiss}
                    onSelect={handleSelect}
                  />
                ))}
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Apps Open</Text>
            <Text style={styles.emptySubtitle}>
              Your recently used apps will appear here
            </Text>
          </View>
        )}

        {/* Page Indicators */}
        {apps.length > 1 && (
          <View style={styles.pageIndicators}>
            {apps.map((_, index) => (
              <PageDot key={index} index={index} activeIndex={activeIndex} />
            ))}
          </View>
        )}

        {/* Close Button */}
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Done</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function PageDot({
  index,
  activeIndex,
}: {
  index: number
  activeIndex: Animated.SharedValue<number>
}) {
  const dotStyle = useAnimatedStyle(() => {
    const isActive = Math.abs(activeIndex.value - index) < 0.5
    return {
      width: withSpring(isActive ? 24 : 8),
      opacity: withTiming(isActive ? 1 : 0.4),
    }
  })

  return <Animated.View style={[styles.pageDot, dotStyle]} />
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    fontWeight: "500",
  },
  carouselContainer: {
    flex: 1,
    justifyContent: "center",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  card: {
    alignItems: "center",
  },
  cardInner: {
    flex: 1,
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#1f2937",
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  screenshotArea: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  screenshot: {
    width: "100%",
    height: "100%",
  },
  placeholderContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderLetter: {
    color: "white",
    fontSize: 72,
    fontWeight: "300",
    opacity: 0.8,
  },
  statusBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTime: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  swipeIndicator: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  swipeBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  appLabelContainer: {
    marginTop: 16,
    alignItems: "center",
    gap: 8,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  appIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  appIconLetter: {
    color: "white",
    fontSize: 22,
    fontWeight: "600",
  },
  appName: {
    color: "white",
    fontSize: 13,
    fontWeight: "500",
    maxWidth: CARD_WIDTH * 0.8,
    textAlign: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 16,
  },
  pageIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  pageDot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "white",
  },
  closeButton: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  closeButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
  },
})

export type {AppCard}