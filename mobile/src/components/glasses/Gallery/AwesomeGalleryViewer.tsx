/**
 * AwesomeGalleryViewer - Unified gallery for images and videos
 * Uses react-native-awesome-gallery for buttery-smooth 60fps swiping
 */

import Slider from "@react-native-community/slider"
import {Image} from "expo-image"
import {useState, useRef, useEffect, type ElementRef} from "react"
// eslint-disable-next-line no-restricted-imports
import {View, TouchableOpacity, Modal, StatusBar, Text, Dimensions} from "react-native"
import Gallery, {GalleryRef} from "react-native-awesome-gallery"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import Video from "react-native-video"

import {ThemedStyle} from "@/theme"
import {PhotoInfo} from "@/types/asg"
import {useAppTheme} from "@/utils/useAppTheme"

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get("window")

interface AwesomeGalleryViewerProps {
  visible: boolean
  photos: PhotoInfo[]
  initialIndex: number
  onClose: () => void
  onShare?: () => void
}

interface VideoPlayerItemProps {
  photo: PhotoInfo
  isActive: boolean
}

interface ImageItemProps {
  photo: PhotoInfo
  setImageDimensions: (dimensions: {width: number; height: number}) => void
}

/**
 * Video player component for gallery items
 */
function VideoPlayerItem({photo, isActive}: VideoPlayerItemProps) {
  const {themed} = useAppTheme()
  const videoRef = useRef<ElementRef<typeof Video>>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Auto-play when this video becomes active
  useEffect(() => {
    if (isActive) {
      console.log("🎥 [VideoPlayerItem] Video became active, starting playback:", photo.name)
      setIsPlaying(true)
    } else {
      console.log("🎥 [VideoPlayerItem] Video became inactive, pausing:", photo.name)
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }, [isActive, photo.name])

  // Hide controls after 3 seconds
  useEffect(() => {
    if (showControls && isPlaying && isActive) {
      const timer = setTimeout(() => setShowControls(false), 3000)
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
    <View style={themed($videoPlayerContainer)}>
      <Video
        ref={videoRef}
        source={{uri: videoUrl}}
        style={themed($video)}
        resizeMode="contain"
        paused={!isPlaying}
        controls={false}
        onProgress={({currentTime: time}) => {
          if (!isSeeking) {
            setCurrentTime(time)
          }
        }}
        onLoad={({duration: dur}) => {
          setDuration(dur)
          setHasError(false)
        }}
        onError={error => {
          console.error("🎥 [VideoPlayerItem] Video error:", error)
          const errorStr = String(error?.error?.errorString || error?.error?.code || "Unknown error")
          const isCorrupted = errorStr.includes("UNSUPPORTED") || errorStr.includes("PARSING")
          setHasError(true)
          setErrorMessage(isCorrupted ? "Video file corrupted or unsupported format" : "Failed to play video")
          setIsPlaying(false)
        }}
        onEnd={() => setIsPlaying(false)}
        onSeek={() => setIsSeeking(false)}
      />

      {/* Tap area to toggle controls */}
      <TouchableOpacity activeOpacity={1} style={themed($tapArea)} onPress={() => setShowControls(!showControls)} />

      {/* Error Message Overlay */}
      {hasError && (
        <View style={themed($errorContainer)}>
          <View style={themed($errorBadge)}>
            <MaterialCommunityIcons name="alert-circle" size={60} color="#FF6B6B" />
            <Text style={themed($errorTitle)}>Playback Error</Text>
            <Text style={themed($errorMessage)}>{errorMessage}</Text>
            <Text style={themed($errorSubtext)}>This video may be corrupted or in an unsupported format.</Text>
          </View>
        </View>
      )}

      {/* Play/Pause Button */}
      {showControls && !hasError && (
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
          style={themed($playButton)}
          hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}>
          <View style={[themed($playButtonBackground), isPlaying && themed($playButtonPlaying)]}>
            <MaterialCommunityIcons
              name={isPlaying ? "pause" : duration > 0 && currentTime >= duration - 0.5 ? "replay" : "play"}
              size={50}
              color="white"
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Seek Bar */}
      {showControls && !hasError && (
        <View style={themed($seekContainer)}>
          <View style={themed($seekBarWrapper)}>
            <Text style={themed($timeText)}>{formatTime(currentTime)}</Text>
            <Slider
              style={themed($seekBar)}
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
            <Text style={themed($timeText)}>{formatTime(duration)}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

/**
 * Image component for gallery items
 */
function ImageItem({photo, setImageDimensions}: ImageItemProps) {
  const imageUri = photo.filePath
    ? photo.filePath.startsWith("file://")
      ? photo.filePath
      : `file://${photo.filePath}`
    : photo.url

  // Use PhotoImage for consistent handling of AVIF, loading states, etc.
  return (
    <View style={{width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center"}}>
      <Image
        source={{uri: imageUri}}
        style={{width: SCREEN_WIDTH, height: SCREEN_HEIGHT}}
        contentFit="contain"
        onLoad={e => {
          // Report dimensions back to Gallery for proper scaling
          if (e.source?.width && e.source?.height) {
            console.log("📸 [ImageItem] Image loaded:", photo.name, "dimensions:", e.source.width, "x", e.source.height)
            setImageDimensions({
              width: e.source.width,
              height: e.source.height,
            })
          }
        }}
      />
    </View>
  )
}

/**
 * Custom overlay with header, counter, and controls
 */
interface CustomOverlayProps {
  onClose: () => void
  currentIndex: number
  total: number
  onShare?: () => void
}

function CustomOverlay({onClose, currentIndex, total, onShare}: CustomOverlayProps) {
  const insets = useSafeAreaInsets()
  const {themed} = useAppTheme()

  return (
    <View style={[themed($header), {paddingTop: insets.top}]}>
      <TouchableOpacity onPress={onClose} style={themed($closeButton)}>
        <MaterialCommunityIcons name="chevron-left" size={32} color="white" />
      </TouchableOpacity>
      <Text style={themed($counterText)}>
        {currentIndex + 1} / {total}
      </Text>
      {onShare ? (
        <TouchableOpacity onPress={onShare} style={themed($actionButton)}>
          <MaterialCommunityIcons name="share-variant" size={24} color="white" />
        </TouchableOpacity>
      ) : (
        <View style={themed($actionButton)} />
      )}
    </View>
  )
}

/**
 * Main gallery component using react-native-awesome-gallery
 */
export function AwesomeGalleryViewer({visible, photos, initialIndex, onClose, onShare}: AwesomeGalleryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const galleryRef = useRef<GalleryRef>(null)

  console.log("🎨 [AwesomeGalleryViewer] === RENDER START ===")
  console.log("🎨 [AwesomeGalleryViewer] visible:", visible)
  console.log("🎨 [AwesomeGalleryViewer] photos.length:", photos.length)
  console.log("🎨 [AwesomeGalleryViewer] initialIndex:", initialIndex)
  console.log(
    "🎨 [AwesomeGalleryViewer] photos:",
    photos.map(p => ({name: p.name, isVideo: p.is_video})),
  )

  // Reset index when modal opens
  useEffect(() => {
    if (visible) {
      console.log("🎨 [AwesomeGalleryViewer] Modal opened, setting index to:", initialIndex)
      setCurrentIndex(initialIndex)
    }
  }, [visible, initialIndex])

  if (!visible || photos.length === 0) {
    return null
  }

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <Gallery
        ref={galleryRef}
        data={photos}
        initialIndex={initialIndex}
        onIndexChange={newIndex => {
          console.log("🎨 [AwesomeGalleryViewer] Index changed to:", newIndex, photos[newIndex]?.name)
          setCurrentIndex(newIndex)
        }}
        onSwipeToClose={() => {
          console.log("🎨 [AwesomeGalleryViewer] Swipe to close triggered")
          onClose()
        }}
        renderItem={({item, index, setImageDimensions}) => {
          const isVideo =
            item.is_video || item.mime_type?.startsWith("video/") || item.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)

          const isActiveItem = index === currentIndex

          console.log(
            "🎨 [AwesomeGalleryViewer] Rendering item:",
            item.name,
            "isVideo:",
            isVideo,
            "isActive:",
            isActiveItem,
          )

          if (isVideo) {
            return <VideoPlayerItem photo={item} isActive={isActiveItem} />
          }

          return <ImageItem photo={item} setImageDimensions={setImageDimensions} />
        }}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        numToRender={3}
        emptySpaceWidth={24}
        maxScale={4}
        doubleTapScale={2.5}
        pinchEnabled={true}
        swipeEnabled={true}
        doubleTapEnabled={true}
        disableVerticalSwipe={false}
        loop={false}
        onTap={() => {
          console.log("🎨 [AwesomeGalleryViewer] Gallery tapped")
        }}
      />

      {/* Custom overlay */}
      <CustomOverlay onClose={onClose} currentIndex={currentIndex} total={photos.length} onShare={onShare} />
    </Modal>
  )
}

// Themed styles
const $header: ThemedStyle<any> = ({spacing}) => ({
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
  zIndex: 100,
})

const $closeButton: ThemedStyle<any> = ({spacing}) => ({
  padding: spacing.s3,
})

const $actionButton: ThemedStyle<any> = ({spacing}) => ({
  padding: spacing.s3,
  minWidth: 44,
  minHeight: 44,
})

const $counterText: ThemedStyle<any> = ({spacing}) => ({
  color: "white",
  fontSize: 16,
  fontWeight: "600",
  marginLeft: spacing.s3,
})

// Video player styles
const $videoPlayerContainer: ThemedStyle<any> = () => ({
  flex: 1,
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  backgroundColor: "black",
  justifyContent: "center",
  alignItems: "center",
})

const $video: ThemedStyle<any> = () => ({
  width: "100%",
  aspectRatio: 4 / 3,
})

const $tapArea: ThemedStyle<any> = () => ({
  position: "absolute",
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  zIndex: 1,
})

const $errorContainer: ThemedStyle<any> = () => ({
  position: "absolute",
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  backgroundColor: "rgba(0,0,0,0.85)",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 50,
})

const $errorBadge: ThemedStyle<any> = ({spacing}) => ({
  backgroundColor: "rgba(30,30,30,0.95)",
  borderRadius: 16,
  padding: spacing.s8,
  alignItems: "center",
  maxWidth: SCREEN_WIDTH * 0.8,
  borderWidth: 2,
  borderColor: "rgba(255,107,107,0.3)",
})

const $errorTitle: ThemedStyle<any> = ({spacing}) => ({
  fontSize: 20,
  fontWeight: "bold",
  color: "#FF6B6B",
  marginTop: spacing.s4,
  marginBottom: spacing.s2,
})

const $errorMessage: ThemedStyle<any> = ({spacing}) => ({
  fontSize: 16,
  color: "white",
  textAlign: "center",
  marginBottom: spacing.s3,
})

const $errorSubtext: ThemedStyle<any> = () => ({
  fontSize: 13,
  color: "rgba(255,255,255,0.6)",
  textAlign: "center",
  lineHeight: 18,
})

const $playButton: ThemedStyle<any> = () => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: [{translateX: -40}, {translateY: -40}],
  zIndex: 100,
})

const $playButtonBackground: ThemedStyle<any> = () => ({
  width: 80,
  height: 80,
  borderRadius: 40,
  backgroundColor: "rgba(0,0,0,0.6)",
  justifyContent: "center",
  alignItems: "center",
})

const $playButtonPlaying: ThemedStyle<any> = () => ({
  backgroundColor: "rgba(0,0,0,0.3)",
})

const $seekContainer: ThemedStyle<any> = ({spacing}) => ({
  position: "absolute",
  bottom: spacing.s8,
  left: 0,
  right: 0,
  paddingHorizontal: spacing.s6,
  zIndex: 100,
})

const $seekBarWrapper: ThemedStyle<any> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(0,0,0,0.7)",
  borderRadius: 16,
  paddingVertical: spacing.s3,
  paddingHorizontal: spacing.s4,
})

const $seekBar: ThemedStyle<any> = ({spacing}) => ({
  flex: 1,
  height: 40,
  marginHorizontal: spacing.s3,
})

const $timeText: ThemedStyle<any> = () => ({
  color: "white",
  fontSize: 12,
  minWidth: 45,
  textAlign: "center",
})
