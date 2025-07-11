# Photo Capture Guide

This guide covers how to capture photos from smart glasses using the MentraOS Camera Module.

## Overview

Photo capture allows your app to request individual photos from connected smart glasses. This is perfect for:
- Documentation and note-taking apps
- Visual assistance applications
- Inventory management
- Social sharing features
- Accessibility tools

## Basic Usage

### Simple Photo Capture

```typescript
// Request a photo from the smart glasses
const photo = await session.camera.requestPhoto();

console.log(`Photo captured: ${photo.filename}`);
console.log(`Size: ${photo.size} bytes`);
console.log(`Type: ${photo.mimeType}`);
```


### Working with Photo Data

The photo is returned as a `Buffer` object. Here are common ways to use it:

```typescript
private async processPhoto(session: AppSession): Promise<void> {
  try {
    const photo = await session.camera.requestPhoto();

    // Convert to base64 for storage or transmission
    const base64String = photo.buffer.toString('base64');
    session.logger.info(`Photo as base64 (first 50 chars): ${base64String.substring(0, 50)}...`);

    // Save to file (Node.js)
    import fs from 'fs';
    const filename = `photo_${Date.now()}.jpg`;
    fs.writeFileSync(filename, photo.buffer);
    session.logger.info(`Photo saved to file: ${filename}`);

    // Send to external API
    await this.uploadPhotoToAPI(photo.buffer, photo.mimeType);
  } catch (error) {
    session.logger.error('Failed to process photo:', error);
  }
}

private async uploadPhotoToAPI(buffer: Buffer, mimeType: string): Promise<void> {
  // Example: Upload to your backend API
  // const formData = new FormData();
  // formData.append('photo', new Blob([buffer], { type: mimeType }));
  // await fetch('/api/upload', { method: 'POST', body: formData });
}
```



## See Also

- [Camera API Reference](/reference/managers/camera) - Complete API documentation
- [RTMP Streaming Guide](/camera/rtmp-streaming) - Live video streaming
- [Permissions Guide](/permissions) - Setting up camera permissions
- [Events Documentation](/events) - Camera-related events