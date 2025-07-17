import React from "react"
import {View, StyleSheet, Dimensions, Text} from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"

interface VideoThumbnailProps {
  videoPath: string
  style?: any
  isDarkTheme: boolean
}

/**
 * Component for displaying video thumbnails - simplified version without actual thumbnails
 * to avoid compatibility issues
 */
const VideoThumbnail: React.FC<VideoThumbnailProps> = ({videoPath, style, isDarkTheme}) => {
  // Thumbnail for the left side of card
  const screenWidth = Dimensions.get("window").width
  const cardWidth = screenWidth - 30 // Card width with padding
  const thumbnailWidth = cardWidth / 3.5 // About 1/3 of card width
  const thumbnailHeight = thumbnailWidth * 0.83 // Slightly reduced height (75/90 ratio)

  // Extract timestamp from filename for display
  const filename = videoPath.split("/").pop() || ""
  const match = filename.match(/glasses-recording-(\d+)\.mp4/)
  let timestamp = null
  if (match && match[1]) {
    timestamp = parseInt(match[1])
  }

  // Create a color based on the timestamp to differentiate videos
  const generateColor = (input: number | null) => {
    if (input === null) return isDarkTheme ? "#3a3a3a" : "#e0e0e0"

    // Use the timestamp to generate a hue value (0-360)
    const hue = input % 360

    // Create a pastel color for light theme or a vibrant color for dark theme
    return isDarkTheme
      ? `hsl(${hue}, 70%, 40%)` // Vibrant for dark theme
      : `hsl(${hue}, 70%, 85%)` // Pastel for light theme
  }

  const bgColor = generateColor(timestamp)

  return (
    <View
      style={[
        styles.container,
        {
          width: thumbnailWidth,
          height: thumbnailHeight,
          backgroundColor: bgColor,
        },
        style,
      ]}>
      <View style={styles.playIconOverlay}>
        <Icon name="videocam" size={28} color={isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.6)"} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  durationBadge: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    bottom: 5,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
    right: 5,
  },
  durationText: {
    color: "white",
    fontFamily: "Montserrat-Regular",
    fontSize: 10,
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
})

export default VideoThumbnail
