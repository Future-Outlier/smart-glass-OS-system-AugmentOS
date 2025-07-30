/**
 * Photo grid display component
 */

import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, FlatList, ActivityIndicator } from 'react-native'
import { useAppTheme } from '@/utils/useAppTheme'
import { ThemedStyle } from '@/theme'
import { PhotoGridProps, PhotoInfo } from '../../types'
import { translate } from '@/i18n/translate'
import { asgCameraApi } from '../../services/asgCameraApi'

interface PhotoItemState {
  loading: boolean
  error: boolean
  imageUrl?: string
}

export function PhotoGrid({ 
  photos, 
  onPhotoPress, 
  onPhotoLongPress,
  loading = false,
  emptyMessage,
  ListHeaderComponent
}: PhotoGridProps) {
  const { theme, themed } = useAppTheme()
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoItemState>>({})

  const getImageUrl = async (photo: PhotoInfo): Promise<string> => {
    console.log(`[PhotoGrid] Getting image URL for photo:`, photo)
    
    // If the photo already has a valid URL, use it
    if (photo.url && photo.url.startsWith('http')) {
      console.log(`[PhotoGrid] Using existing URL: ${photo.url}`)
      return photo.url
    }

    // If we have a filename, construct the URL using the API
    if (photo.name) {
      try {
        console.log(`[PhotoGrid] Attempting to get photo as data URL for: ${photo.name}`)
        // Try to get the photo as a data URL from the server
        const dataUrl = await asgCameraApi.getPhotoAsDataUrl(photo.name)
        console.log(`[PhotoGrid] Successfully got data URL for: ${photo.name}`)
        return dataUrl
      } catch (error) {
        console.error(`[PhotoGrid] Failed to get photo as data URL for ${photo.name}:`, error)
        // Fallback to constructing a direct URL
        const serverUrl = asgCameraApi.getServerUrl()
        const fallbackUrl = `${serverUrl}/api/photo?file=${encodeURIComponent(photo.name)}`
        console.log(`[PhotoGrid] Using fallback URL: ${fallbackUrl}`)
        return fallbackUrl
      }
    }

    // Last resort fallback
    console.log(`[PhotoGrid] No valid URL found for photo:`, photo)
    return photo.url || ''
  }

  const handleImageLoad = (photoName: string) => {
    setPhotoStates(prev => ({
      ...prev,
      [photoName]: { ...prev[photoName], loading: false, error: false }
    }))
  }

  const handleImageError = (photoName: string, error: any) => {
    console.error(`[PhotoGrid] Image load error for ${photoName}:`, error)
    setPhotoStates(prev => ({
      ...prev,
      [photoName]: { ...prev[photoName], loading: false, error: true }
    }))
  }

  const renderPhoto = ({ item: photo }: { item: PhotoInfo }) => {
    console.log(`[PhotoGrid] Rendering photo:`, photo.name, `State:`, photoStates[photo.name])
    const photoState = photoStates[photo.name] || { loading: true, error: false }

    // Initialize photo state if not exists
    if (!photoStates[photo.name]) {
      console.log(`[PhotoGrid] Initializing state for photo: ${photo.name}`)
      getImageUrl(photo).then(url => {
        console.log(`[PhotoGrid] Got URL for ${photo.name}:`, url.substring(0, 50) + '...')
        setPhotoStates(prev => ({
          ...prev,
          [photo.name]: { loading: false, error: false, imageUrl: url }
        }))
      }).catch(error => {
        console.error(`[PhotoGrid] Failed to get image URL for ${photo.name}:`, error)
        setPhotoStates(prev => ({
          ...prev,
          [photo.name]: { loading: false, error: true }
        }))
      })
    }

    return (
      <TouchableOpacity
        style={themed($photoContainer)}
        onPress={() => onPhotoPress(photo)}
        onLongPress={() => onPhotoLongPress?.(photo)}
        activeOpacity={0.8}
      >
        <View style={themed($imageContainer)}>
          {photoState.loading && (
            <View style={themed($loadingOverlay)}>
              <ActivityIndicator size="small" color={theme.colors.text} />
            </View>
          )}
          
          {photoState.error ? (
            <View style={themed($errorContainer)}>
              <Text style={themed($errorText)}>⚠️</Text>
              <Text style={themed($errorSubtext)}>Failed to load</Text>
            </View>
          ) : photoState.imageUrl ? (
            <Image
              source={{ uri: photoState.imageUrl }}
              style={themed($photoImage)}
              resizeMode="cover"
              onLoad={() => handleImageLoad(photo.name)}
              onError={(error) => handleImageError(photo.name, error)}
            />
          ) : (
            <View style={themed($placeholderContainer)}>
              <ActivityIndicator size="small" color={theme.colors.text} />
            </View>
          )}
        </View>
        
        <View style={themed($photoInfo)}>
          <Text style={themed($photoName)} numberOfLines={1}>
            {photo.name}
          </Text>
          <Text style={themed($photoMeta)}>
            {formatFileSize(photo.size)} • {formatDate(photo.modified)}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  const renderEmpty = () => (
    <View style={themed($emptyContainer)}>
      <Text style={themed($emptyText)}>
        {emptyMessage || translate('glasses:noPhotos')}
      </Text>
      <Text style={themed($emptySubtext)}>
        {translate('glasses:takeFirstPhoto')}
      </Text>
    </View>
  )

  if (loading) {
    return (
      <View style={themed($loadingContainer)}>
        <ActivityIndicator size="large" color={theme.colors.text} />
        <Text style={themed($loadingText)}>
          {translate('glasses:loadingPhotos')}
        </Text>
      </View>
    )
  }

  return (
    <FlatList
      data={photos}
      renderItem={renderPhoto}
      keyExtractor={(item) => item.name}
      numColumns={2}
      columnWrapperStyle={themed($photoRow)}
      contentContainerStyle={themed($gridContainer)}
      ListEmptyComponent={renderEmpty}
      ListHeaderComponent={ListHeaderComponent}
      showsVerticalScrollIndicator={false}
    />
  )
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString()
  } catch {
    return dateString
  }
}

const $gridContainer: ThemedStyle<any> = ({ spacing }) => ({
  padding: spacing.sm,
})

const $photoRow: ThemedStyle<any> = ({ spacing }) => ({
  justifyContent: 'space-between',
  marginBottom: spacing.sm,
})

const $photoContainer: ThemedStyle<any> = ({ colors, spacing }) => ({
  backgroundColor: colors.background,
  borderRadius: spacing.sm,
  overflow: 'hidden',
  flex: 1,
  marginHorizontal: spacing.xs,
  shadowColor: colors.text,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
})

const $imageContainer: ThemedStyle<any> = () => ({
  position: 'relative',
  width: '100%',
  height: 150,
})

const $photoImage: ThemedStyle<any> = () => ({
  width: '100%',
  height: '100%',
})

const $loadingOverlay: ThemedStyle<any> = ({ colors }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: colors.background,
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1,
})

const $errorContainer: ThemedStyle<any> = ({ colors }) => ({
  width: '100%',
  height: '100%',
  backgroundColor: colors.background,
  justifyContent: 'center',
  alignItems: 'center',
})

const $errorText: ThemedStyle<any> = () => ({
  fontSize: 24,
  marginBottom: 4,
})

const $errorSubtext: ThemedStyle<any> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 12,
  textAlign: 'center',
})

const $placeholderContainer: ThemedStyle<any> = ({ colors }) => ({
  width: '100%',
  height: '100%',
  backgroundColor: '#f8f9fa',
  justifyContent: 'center',
  alignItems: 'center',
})

const $photoInfo: ThemedStyle<any> = ({ colors, spacing }) => ({
  padding: spacing.sm,
})

const $photoName: ThemedStyle<any> = ({ colors, spacing }) => ({
  color: colors.text,
  fontSize: 14,
  fontWeight: '500',
  marginBottom: spacing.xs,
})

const $photoMeta: ThemedStyle<any> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 12,
})

const $emptyContainer: ThemedStyle<any> = ({ colors, spacing }) => ({
  alignItems: 'center',
  paddingVertical: spacing.xl,
})

const $emptyText: ThemedStyle<any> = ({ colors, spacing }) => ({
  color: colors.textDim,
  fontSize: 16,
  fontWeight: '500',
  marginBottom: spacing.sm,
})

const $emptySubtext: ThemedStyle<any> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 14,
  textAlign: 'center',
})

const $loadingContainer: ThemedStyle<any> = ({ colors, spacing }) => ({
  alignItems: 'center',
  paddingVertical: spacing.xl,
})

const $loadingText: ThemedStyle<any> = ({ colors, spacing }) => ({
  color: colors.textDim,
  fontSize: 16,
  marginTop: spacing.sm,
}) 