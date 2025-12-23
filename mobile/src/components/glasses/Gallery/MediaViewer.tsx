/**
 * Media viewer component that handles both images and videos
 * Supports horizontal swiping between media items
 */

import Slider from "@react-native-community/slider"
import {useState, useRef, useEffect, type ElementRef, memo} from "react"
import {View, TouchableOpacity, Modal, StatusBar, Dimensions} from "react-native"
// eslint-disable-next-line no-restricted-imports
import {Text, StyleSheet} from "react-native"
import {GestureDetector, Gesture} from "react-native-gesture-handler"
import PagerView from "react-native-pager-view"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
} from "react-native-reanimated"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import Video from "react-native-video"

import {spacing} from "@/theme"
import {PhotoInfo} from "@/types/asg"

import {ImageViewer} from "./ImageViewer"

const AnimatedView = Animated.View

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get("window")

const DISMISS_THRESHOLD = 150 // Vertical distance to trigger dismiss
const VELOCITY_THRESHOLD = 800 // Velocity to trigger dismiss regardless of distance

interface MediaViewerProps {
  visible: boolean
  photo: PhotoInfo | null
  photos?: PhotoInfo[] // Array of all photos for swiping
  initialIndex?: number // Starting index in photos array
  onClose: () => void
  onShare?: () => void
  onDelete?: () => void
}

interface VideoPlayerProps {
  photo: PhotoInfo
  isActive: boolean
  showControls: boolean
  onToggleControls: () => void
}

// Separate video player component for use in pager (memoized for performance)
const VideoPlayer = memo(function VideoPlayer({photo, isActive, showControls, onToggleControls}: VideoPlayerProps) {
  const videoRef = useRef<ElementRef<typeof Video>>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)

  // Auto-play when this video becomes active
  useEffect(() => {
    if (isActive) {
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }, [isActive])

  // Hide controls after 3 seconds
  useEffect(() => {
    if (showControls && isPlaying && isActive) {
      const timer = setTimeout(() => {
        // Can't call onToggleControls directly, would need parent state management
      }, 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [showControls, isPlaying, isActive])

  const videoUrl = photo.download || photo.url

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <View style={styles.videoPlayerContainer}>
      <Video
        ref={videoRef}
        source={{uri: videoUrl}}
        style={styles.videoPlayer}
        resizeMode="contain"
        paused={!isPlaying}
        controls={false}
        onProgress={({currentTime: time}) => {
          if (!isSeeking) {
            setCurrentTime(time)
          }
        }}
        onLoad={({duration: dur}) => setDuration(dur)}
        onError={error => {
          console.error("Video error:", error)
          console.error("Failed to play video from URL:", videoUrl)
        }}
        onEnd={() => setIsPlaying(false)}
        onSeek={() => setIsSeeking(false)}
      />

      {/* Tap area to toggle controls */}
      <TouchableOpacity activeOpacity={1} style={styles.videoTapArea} onPress={onToggleControls} />

      {/* Play/Pause Button */}
      {showControls && (
        <TouchableOpacity
          onPress={e => {
            e.stopPropagation()
            if (!isPlaying && duration > 0 && currentTime >= duration - 0.5) {
              videoRef.current?.seek(0)
              setCurrentTime(0)
              setIsPlaying(true)
            } else {
              setIsPlaying(!isPlaying)
            }
          }}
          style={styles.videoPlayButton}
          hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}>
          <View style={[styles.playButtonBackground, isPlaying && styles.playButtonPlaying]}>
            <MaterialCommunityIcons
              name={isPlaying ? "pause" : duration > 0 && currentTime >= duration - 0.5 ? "replay" : "play"}
              size={50}
              color="white"
              style={isPlaying || (duration > 0 && currentTime >= duration - 0.5) ? {} : {marginLeft: 4}}
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Seek Bar */}
      {showControls && (
        <View style={styles.videoSeekContainer} pointerEvents="box-none">
          <View style={styles.seekBarWrapper}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Slider
              style={styles.seekBar}
              value={currentTime}
              minimumValue={0}
              maximumValue={duration}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#FFFFFF"
              onSlidingStart={() => setIsSeeking(true)}
              onSlidingComplete={value => {
                videoRef.current?.seek(value)
              }}
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>
      )}
    </View>
  )
})

export function MediaViewer({
  visible,
  photo,
  photos,
  initialIndex = 0,
  onClose,
  onShare,
  onDelete: _onDelete,
}: MediaViewerProps) {
  const insets = useSafeAreaInsets()
  const pagerRef = useRef<ElementRef<typeof PagerView>>(null)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // Dismiss gesture values
  const translateY = useSharedValue(0)
  const scale = useSharedValue(1)
  const backgroundOpacity = useSharedValue(1)

  // If photos array is provided, use gallery mode
  const isGalleryMode = photos && photos.length > 0
  const displayPhotos = isGalleryMode ? photos : photo ? [photo] : []
  const currentPhoto = displayPhotos[currentIndex]

  // Video-specific state for the current photo
  const videoRef = useRef<ElementRef<typeof Video>>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)

  // Determine if current item is a video
  const isVideo = currentPhoto
    ? currentPhoto.is_video ||
      currentPhoto.mime_type?.startsWith("video/") ||
      currentPhoto.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)
    : false

  // Reset gesture values when modal opens/closes
  useEffect(() => {
    if (visible) {
      translateY.value = 0
      scale.value = 1
      backgroundOpacity.value = 1
    }
  }, [visible, translateY, scale, backgroundOpacity])

  // Reset to initial index when modal opens
  useEffect(() => {
    if (visible && isGalleryMode) {
      console.log(`[MediaViewer] Opening gallery at index ${initialIndex} of ${displayPhotos.length} photos`)
      setCurrentIndex(initialIndex)
      // Set pager to initial index after a brief delay to ensure it's mounted
      setTimeout(() => {
        pagerRef.current?.setPage(initialIndex)
      }, 100)
    }
  }, [visible, initialIndex, isGalleryMode, displayPhotos.length])

  // Reset video state when current photo changes
  useEffect(() => {
    if (isVideo) {
      setIsPlaying(true)
      setShowControls(true)
      setCurrentTime(0)
      setDuration(0)
      setIsSeeking(false)
    }
  }, [currentPhoto, isVideo])

  // Hide controls after 3 seconds of inactivity
  useEffect(() => {
    if (isVideo && showControls && isPlaying) {
      const timer = setTimeout(() => setShowControls(false), 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isVideo, showControls, isPlaying, currentIndex])

  // Helper functions for gesture
  const triggerClose = () => {
    onClose()
  }

  const resetDismissValues = () => {
    "worklet"
    translateY.value = withSpring(0, {damping: 20, stiffness: 300})
    scale.value = withSpring(1, {damping: 20, stiffness: 300})
    backgroundOpacity.value = withTiming(1, {duration: 200})
  }

  // Vertical pan gesture for dismiss (only in gallery mode)
  const dismissGesture = Gesture.Pan()
    .enabled(isGalleryMode || false)
    .activeOffsetY([-10, 10])
    .failOffsetX([-30, 30])
    .onUpdate(e => {
      // Only allow vertical drag, not horizontal
      if (Math.abs(e.velocityX) < Math.abs(e.velocityY)) {
        translateY.value = e.translationY

        // Scale down as user drags
        const dragProgress = Math.abs(e.translationY) / SCREEN_HEIGHT
        scale.value = interpolate(dragProgress, [0, 0.3], [1, 0.85], Extrapolate.CLAMP)

        // Fade background
        backgroundOpacity.value = interpolate(
          Math.abs(e.translationY),
          [0, DISMISS_THRESHOLD * 2],
          [1, 0],
          Extrapolate.CLAMP,
        )
      }
    })
    .onEnd(e => {
      const shouldDismiss = Math.abs(e.translationY) > DISMISS_THRESHOLD || Math.abs(e.velocityY) > VELOCITY_THRESHOLD

      if (shouldDismiss) {
        // Animate out and close
        translateY.value = withTiming(e.translationY > 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT, {duration: 250}, () => {
          runOnJS(triggerClose)()
        })
        scale.value = withTiming(0.7, {duration: 250})
        backgroundOpacity.value = withTiming(0, {duration: 250})
      } else {
        // Snap back
        resetDismissValues()
      }
    })

  // Animated styles
  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}, {scale: scale.value}],
  }))

  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }))

  if (!currentPhoto) return null

  // For gallery mode (images or videos), use pager
  if (isGalleryMode) {
    return (
      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <AnimatedView style={[styles.backgroundOverlay, animatedBackgroundStyle]} />
        <GestureDetector gesture={dismissGesture}>
          <AnimatedView style={[styles.container, animatedContainerStyle]}>
            <StatusBar hidden />

            {/* Header */}
            <View style={[styles.header, {paddingTop: insets.top}]}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
              </TouchableOpacity>
              <Text style={styles.counterText}>
                {currentIndex + 1} / {displayPhotos.length}
              </Text>
              {onShare && (
                <TouchableOpacity onPress={onShare} style={styles.actionButton}>
                  <MaterialCommunityIcons name="share-variant" size={24} color="white" />
                </TouchableOpacity>
              )}
            </View>

            {/* Pager for swiping */}
            <PagerView
              ref={pagerRef}
              style={styles.pager}
              initialPage={initialIndex}
              offscreenPageLimit={1}
              overdrag={false}
              onPageSelected={e => {
                const newIndex = e.nativeEvent.position
                setCurrentIndex(newIndex)
                // Pause video when swiping away
                if (isPlaying) {
                  setIsPlaying(false)
                }
              }}>
              {displayPhotos.map((photoItem, index) => {
                const itemIsVideo =
                  photoItem.is_video ||
                  photoItem.mime_type?.startsWith("video/") ||
                  photoItem.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)

                // Only render pages within range of current index (lazy loading)
                const isWithinRange = Math.abs(index - currentIndex) <= 2

                if (!isWithinRange) {
                  // Render empty placeholder for far-away pages
                  return <View key={`${photoItem.name}-${index}`} style={styles.page} />
                }

                if (itemIsVideo) {
                  // Render video player for this page
                  return (
                    <View key={`${photoItem.name}-${index}`} style={styles.page}>
                      <VideoPlayer
                        photo={photoItem}
                        isActive={currentIndex === index}
                        showControls={showControls}
                        onToggleControls={() => setShowControls(!showControls)}
                      />
                    </View>
                  )
                } else {
                  // Render image viewer for this page
                  return (
                    <View key={`${photoItem.name}-${index}`} style={styles.page}>
                      <ImageViewer visible={true} photo={photoItem} onClose={onClose} onShare={onShare} isEmbedded />
                    </View>
                  )
                }
              })}
            </PagerView>
          </AnimatedView>
        </GestureDetector>
      </Modal>
    )
  }

  // For single images without gallery mode, use simple viewer
  if (!isVideo && !isGalleryMode) {
    return <ImageViewer visible={visible} photo={currentPhoto} onClose={onClose} onShare={onShare} />
  }

  // For videos, use a custom modal with video player
  // Use download URL for videos (actual video file) instead of photo URL (thumbnail)
  const videoUrl = currentPhoto.download || currentPhoto.url
  console.log("[MediaViewer] Playing video from URL:", videoUrl)

  // Format time in MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.videoContainer}>
        <StatusBar hidden />

        {/* Video Player */}
        <View style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={{uri: videoUrl}}
            style={styles.video}
            resizeMode="contain"
            paused={!isPlaying}
            controls={false} // Disable native controls
            onProgress={({currentTime}) => {
              if (!isSeeking) {
                setCurrentTime(currentTime)
              }
            }}
            onLoad={({duration}) => setDuration(duration)}
            onError={error => {
              console.error("Video error:", error)
              console.error("Failed to play video from URL:", videoUrl)
            }}
            onEnd={() => setIsPlaying(false)}
            onSeek={() => setIsSeeking(false)}
          />

          {/* Invisible tap area to toggle controls */}
          <TouchableOpacity
            activeOpacity={1}
            style={styles.tapArea}
            onPress={() => {
              console.log("[MediaViewer] Toggling controls, current state:", showControls)
              setShowControls(!showControls)
            }}
          />
        </View>

        {/* Header - Show/hide with controls */}
        {showControls && (
          <View style={[styles.header, {paddingTop: insets.top}]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
            </TouchableOpacity>
            {isGalleryMode && (
              <Text style={styles.counterText}>
                {currentIndex + 1} / {displayPhotos.length}
              </Text>
            )}
            <View style={{flex: 1}} />
            {onShare && (
              <TouchableOpacity onPress={onShare} style={styles.actionButton}>
                <MaterialCommunityIcons name="share-variant" size={24} color="white" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Play/Pause Button in Center */}
        {showControls && (
          <TouchableOpacity
            onPress={e => {
              e.stopPropagation()
              console.log(
                "[MediaViewer] Play/Pause button pressed, isPlaying:",
                isPlaying,
                "currentTime:",
                currentTime,
                "duration:",
                duration,
              )

              // If video is at the end (within 0.5 seconds of end), restart from beginning
              if (!isPlaying && duration > 0 && currentTime >= duration - 0.5) {
                console.log("[MediaViewer] Restarting video from beginning")
                videoRef.current?.seek(0)
                setCurrentTime(0)
                setIsPlaying(true)
              } else {
                setIsPlaying(!isPlaying)
              }
            }}
            style={styles.centerPlayButton}
            hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}>
            <View style={[styles.playButtonBackground, isPlaying && styles.playButtonPlaying]}>
              <MaterialCommunityIcons
                name={isPlaying ? "pause" : duration > 0 && currentTime >= duration - 0.5 ? "replay" : "play"}
                size={50}
                color="white"
                style={isPlaying || (duration > 0 && currentTime >= duration - 0.5) ? {} : {marginLeft: 4}} // Adjust play icon to be centered
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Bottom Controls - Seek Bar */}
        {showControls && (
          <View style={styles.bottomControls} pointerEvents="box-none">
            <View style={styles.seekContainer}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Slider
                style={styles.seekBar}
                value={currentTime}
                minimumValue={0}
                maximumValue={duration}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#FFFFFF"
                onSlidingStart={() => setIsSeeking(true)}
                onSlidingComplete={value => {
                  videoRef.current?.seek(value)
                }}
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "black",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 100, // Higher z-index than tap area
  },
  closeButton: {
    padding: spacing.s3,
  },
  actionButton: {
    padding: spacing.s3,
  },
  counterText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: spacing.s3,
  },
  // Video player styles
  videoPlayerContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    width: "100%",
    aspectRatio: 4 / 3, // Default to 4:3 aspect ratio for videos
  },
  videoTapArea: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 1,
  },
  videoPlayButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{translateX: -40}, {translateY: -40}],
    zIndex: 100,
  },
  videoSeekContainer: {
    position: "absolute",
    bottom: spacing.s8,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.s6,
    zIndex: 100,
  },
  seekBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 16,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  // Legacy single video container (kept for backward compatibility)
  videoContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  videoWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    aspectRatio: 4 / 3, // Default to 4:3 aspect ratio for videos
  },
  tapArea: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 1, // Lower z-index than controls
  },
  centerPlayButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{translateX: -40}, {translateY: -40}],
    zIndex: 100,
  },
  playButtonBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonPlaying: {
    backgroundColor: "rgba(0,0,0,0.3)", // More transparent when playing
  },
  bottomControls: {
    position: "absolute",
    bottom: spacing.s8, // Same margin as sync button
    left: 0,
    right: 0,
    paddingHorizontal: spacing.s6,
    zIndex: 100,
  },
  seekContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 16,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  seekBar: {
    flex: 1,
    height: 40,
    marginHorizontal: spacing.s3,
  },
  timeText: {
    color: "white",
    fontSize: 12,
    minWidth: 45,
    textAlign: "center",
  },
})
