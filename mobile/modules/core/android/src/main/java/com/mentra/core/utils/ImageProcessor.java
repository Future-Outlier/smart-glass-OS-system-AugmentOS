package com.mentra.core.utils;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Image processor for gallery photos synced from Mentra glasses.
 * Applies lens distortion correction and color correction to improve
 * photo quality before saving to the user's camera roll.
 */
public class ImageProcessor {
  private static final String TAG = "ImageProcessor";

  // Brown-Conrady distortion coefficients for the Mentra Live camera
  // (Sony sensor, 118-degree FOV fisheye lens)
  // Calibrated from chessboard photos at 3264x2448 native sensor resolution.
  private static final double K1 = -0.10;   // Radial distortion (barrel)
  private static final double K2 = 0.02;    // Radial distortion (higher order)
  private static final double P1 = 0.0;     // Tangential distortion
  private static final double P2 = 0.0;     // Tangential distortion

  // Precomputed tone-curve LUT matching iOS CIToneCurve anchor points:
  //   (0.00, 0.05), (0.25, 0.22), (0.50, 0.50), (0.75, 0.78), (1.00, 0.95)
  // Uses piecewise-linear interpolation between anchors.
  private static final int[] TONE_LUT = buildToneLut();

  private static int[] buildToneLut() {
    int[] lut = new int[256];
    // Anchor points matching iOS CIToneCurve
    double[] ax = {0.0, 0.25, 0.50, 0.75, 1.0};
    double[] ay = {0.05, 0.22, 0.50, 0.78, 0.95};
    for (int i = 0; i < 256; i++) {
      double x = i / 255.0;
      // Find which segment x falls in
      double y;
      if (x <= ax[1]) {
        y = ay[0] + (ay[1] - ay[0]) * (x - ax[0]) / (ax[1] - ax[0]);
      } else if (x <= ax[2]) {
        y = ay[1] + (ay[2] - ay[1]) * (x - ax[1]) / (ax[2] - ax[1]);
      } else if (x <= ax[3]) {
        y = ay[2] + (ay[3] - ay[2]) * (x - ax[2]) / (ax[3] - ax[2]);
      } else {
        y = ay[3] + (ay[4] - ay[3]) * (x - ax[3]) / (ax[4] - ax[3]);
      }
      lut[i] = Math.max(0, Math.min(255, (int) (y * 255 + 0.5)));
    }
    return lut;
  }

  // Color correction matrix: slight warmth, saturation boost
  // Applied as a 4x5 ColorMatrix (RGBA + offset in 0-255 scale)
  // Bias values match iOS: 5.0/255.0 * 255 ≈ 5, 3.0/255.0 * 255 ≈ 3
  // Note: Android ColorMatrix offsets are in 0-255 space (correct as-is)
  private static final float[] COLOR_MATRIX = {
    1.06f, 0.02f, -0.01f, 0, 5,     // R: slight warmth
    0.01f, 1.04f, -0.01f, 0, 3,     // G: subtle boost
    -0.02f, 0.01f, 1.02f, 0, 0,     // B: slightly cooler
    0,      0,      0,     1, 0      // A: unchanged
  };

  // Precomputed LUT for lens correction (lazily initialized).
  // Stored as fixed-point Q8 (multiply by 256) for sub-pixel bilinear interpolation.
  private static int[] sRemapXQ8;
  private static int[] sRemapYQ8;
  private static int sLutWidth;
  private static int sLutHeight;

  /**
   * Process a gallery image with the specified corrections.
   *
   * @param inputPath       Path to the input JPEG file
   * @param outputPath      Path to write the processed JPEG
   * @param lensCorrection  Whether to apply barrel distortion correction
   * @param colorCorrection Whether to apply color/white balance correction
   * @param jpegQuality     JPEG output quality (1-100)
   * @return processing time in milliseconds, or -1 on failure
   */
  public static long process(String inputPath, String outputPath,
                             boolean lensCorrection, boolean colorCorrection,
                             int jpegQuality) {
    long startTime = System.currentTimeMillis();

    try {
      // Decode the input image
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inMutable = !lensCorrection; // Need mutable only for color correction without lens
      Bitmap src = BitmapFactory.decodeFile(inputPath, opts);
      if (src == null) {
        Log.e(TAG, "Failed to decode image: " + inputPath);
        return -1;
      }

      int w = src.getWidth();
      int h = src.getHeight();
      Log.d(TAG, "Processing image: " + w + "x" + h
              + " lens=" + lensCorrection + " color=" + colorCorrection);

      Bitmap result = src;

      // Step 1: Lens distortion correction
      if (lensCorrection) {
        result = applyLensCorrection(src, w, h);
        if (result != src) {
          src.recycle();
        }
      }

      // Step 2: Tone mapping — S-curve + vibrance
      if (colorCorrection) {
        Bitmap toneMapped = applyToneMapping(result);
        if (toneMapped != result) {
          result.recycle();
          result = toneMapped;
        }
      }

      // Step 3: Color correction — linear warmth/tint
      if (colorCorrection) {
        Bitmap colorCorrected = applyColorCorrection(result);
        if (colorCorrected != result) {
          result.recycle();
          result = colorCorrected;
        }
      }

      // Write output JPEG
      File outFile = new File(outputPath);
      try (FileOutputStream fos = new FileOutputStream(outFile)) {
        result.compress(Bitmap.CompressFormat.JPEG, jpegQuality, fos);
      }

      result.recycle();

      long elapsed = System.currentTimeMillis() - startTime;
      Log.d(TAG, "Image processing complete in " + elapsed + "ms -> " + outputPath);
      return elapsed;

    } catch (Exception e) {
      Log.e(TAG, "Image processing failed", e);
      return -1;
    }
  }

  /**
   * Apply Brown-Conrady lens distortion correction using a precomputed LUT
   * with bilinear interpolation for sub-pixel accuracy.
   */
  private static Bitmap applyLensCorrection(Bitmap src, int w, int h) {
    // Build or reuse the remapping LUT
    if (sRemapXQ8 == null || sLutWidth != w || sLutHeight != h) {
      buildRemapLut(w, h);
    }

    // Read source pixels
    int[] srcPixels = new int[w * h];
    src.getPixels(srcPixels, 0, w, 0, 0, w, h);

    // Apply remapping with bilinear interpolation
    int[] dstPixels = new int[w * h];
    int maxX = w - 1;
    int maxY = h - 1;

    for (int i = 0; i < w * h; i++) {
      int sxQ8 = sRemapXQ8[i];
      int syQ8 = sRemapYQ8[i];

      // Integer part (floor)
      int x0 = sxQ8 >> 8;
      int y0 = syQ8 >> 8;

      if (x0 < 0 || x0 >= maxX || y0 < 0 || y0 >= maxY) {
        // Out of bounds — black pixel
        dstPixels[i] = 0xFF000000;
        continue;
      }

      // Fractional part (0-255)
      int fx = sxQ8 & 0xFF;
      int fy = syQ8 & 0xFF;
      int ifx = 256 - fx;
      int ify = 256 - fy;

      // Four source pixels
      int idx00 = y0 * w + x0;
      int p00 = srcPixels[idx00];
      int p10 = srcPixels[idx00 + 1];
      int p01 = srcPixels[idx00 + w];
      int p11 = srcPixels[idx00 + w + 1];

      // Bilinear blend per channel
      int r = (ifx * ify * ((p00 >> 16) & 0xFF) + fx * ify * ((p10 >> 16) & 0xFF)
             + ifx * fy * ((p01 >> 16) & 0xFF) + fx * fy * ((p11 >> 16) & 0xFF)) >> 16;
      int g = (ifx * ify * ((p00 >> 8) & 0xFF) + fx * ify * ((p10 >> 8) & 0xFF)
             + ifx * fy * ((p01 >> 8) & 0xFF) + fx * fy * ((p11 >> 8) & 0xFF)) >> 16;
      int b = (ifx * ify * (p00 & 0xFF) + fx * ify * (p10 & 0xFF)
             + ifx * fy * (p01 & 0xFF) + fx * fy * (p11 & 0xFF)) >> 16;

      dstPixels[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    Bitmap dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    dst.setPixels(dstPixels, 0, w, 0, 0, w, h);
    return dst;
  }

  /**
   * Build the remapping LUT for lens distortion correction.
   * Coordinates are stored as Q8 fixed-point (value * 256) to support
   * sub-pixel bilinear interpolation without floating point per-pixel.
   */
  private static synchronized void buildRemapLut(int w, int h) {
    Log.d(TAG, "Building lens correction LUT for " + w + "x" + h);
    long t0 = System.currentTimeMillis();

    int[] remapXQ8 = new int[w * h];
    int[] remapYQ8 = new int[w * h];

    double cx = w / 2.0;
    double cy = h / 2.0;
    double norm = Math.sqrt(cx * cx + cy * cy);

    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        double xn = (x - cx) / norm;
        double yn = (y - cy) / norm;
        double r2 = xn * xn + yn * yn;
        double r4 = r2 * r2;

        double radial = 1.0 + K1 * r2 + K2 * r4;
        double xd = xn * radial + 2 * P1 * xn * yn + P2 * (r2 + 2 * xn * xn);
        double yd = yn * radial + P1 * (r2 + 2 * yn * yn) + 2 * P2 * xn * yn;

        // Store as Q8 fixed-point for bilinear interpolation
        int idx = y * w + x;
        remapXQ8[idx] = (int) ((xd * norm + cx) * 256);
        remapYQ8[idx] = (int) ((yd * norm + cy) * 256);
      }
    }

    sRemapXQ8 = remapXQ8;
    sRemapYQ8 = remapYQ8;
    sLutWidth = w;
    sLutHeight = h;

    Log.d(TAG, "LUT built in " + (System.currentTimeMillis() - t0) + "ms");
  }

  /**
   * Apply tone mapping: S-curve LUT + vibrance in a single pass.
   * Lifts shadows, compresses highlights, and selectively boosts
   * undersaturated colors for a more natural, phone-like look.
   */
  private static Bitmap applyToneMapping(Bitmap src) {
    int w = src.getWidth(), h = src.getHeight();
    int[] pixels = new int[w * h];
    src.getPixels(pixels, 0, w, 0, 0, w, h);

    float[] hsv = new float[3];
    for (int i = 0; i < pixels.length; i++) {
      int r = TONE_LUT[(pixels[i] >> 16) & 0xFF];
      int g = TONE_LUT[(pixels[i] >> 8) & 0xFF];
      int b = TONE_LUT[pixels[i] & 0xFF];

      // Vibrance: boost undersaturated colors more
      Color.RGBToHSV(r, g, b, hsv);
      float boost = 0.3f * (1.0f - hsv[1]); // 30% max for grays, ~0% for vivid
      hsv[1] = Math.min(1.0f, hsv[1] + boost);
      int rgb = Color.HSVToColor(hsv);

      pixels[i] = 0xFF000000 | (rgb & 0x00FFFFFF);
    }

    Bitmap dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    dst.setPixels(pixels, 0, w, 0, 0, w, h);
    return dst;
  }

  /**
   * Apply color correction using a ColorMatrix on a Canvas draw.
   * Adjusts white balance (slight warmth), saturation, and contrast.
   */
  private static Bitmap applyColorCorrection(Bitmap src) {
    Bitmap dst = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(dst);

    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    ColorMatrix cm = new ColorMatrix(COLOR_MATRIX);
    paint.setColorFilter(new ColorMatrixColorFilter(cm));

    canvas.drawBitmap(src, 0, 0, paint);
    return dst;
  }

  /**
   * Merge 3 exposure-bracketed images into a single HDR result using
   * simple exposure fusion (Mertens' method approximation).
   *
   * @param underPath Path to the underexposed image (EV-2)
   * @param normalPath Path to the normally exposed image (EV0)
   * @param overPath Path to the overexposed image (EV+2)
   * @param outputPath Path to write the merged HDR result
   * @param jpegQuality JPEG output quality
   * @return processing time in ms, or -1 on failure
   */
  public static long mergeHdr(String underPath, String normalPath, String overPath,
                               String outputPath, int jpegQuality) {
    long startTime = System.currentTimeMillis();

    try {
      Bitmap under = BitmapFactory.decodeFile(underPath);
      Bitmap normal = BitmapFactory.decodeFile(normalPath);
      Bitmap over = BitmapFactory.decodeFile(overPath);

      if (under == null || normal == null || over == null) {
        Log.e(TAG, "Failed to decode one or more HDR bracket images");
        return -1;
      }

      int w = normal.getWidth();
      int h = normal.getHeight();

      // Ensure all images are the same size
      if (under.getWidth() != w || under.getHeight() != h
          || over.getWidth() != w || over.getHeight() != h) {
        Log.w(TAG, "HDR bracket images have different sizes, resizing");
        under = Bitmap.createScaledBitmap(under, w, h, true);
        over = Bitmap.createScaledBitmap(over, w, h, true);
      }

      int[] underPixels = new int[w * h];
      int[] normalPixels = new int[w * h];
      int[] overPixels = new int[w * h];
      under.getPixels(underPixels, 0, w, 0, 0, w, h);
      normal.getPixels(normalPixels, 0, w, 0, 0, w, h);
      over.getPixels(overPixels, 0, w, 0, 0, w, h);

      int[] resultPixels = new int[w * h];

      // Simple exposure fusion: weight each pixel by how well-exposed it is
      // Well-exposed = closer to mid-gray (128). Clip recovery from under/over.
      for (int i = 0; i < w * h; i++) {
        int uR = (underPixels[i] >> 16) & 0xFF;
        int uG = (underPixels[i] >> 8) & 0xFF;
        int uB = underPixels[i] & 0xFF;
        float uLum = (uR + uG + uB) / 3.0f / 255.0f;
        float uWeight = 4.0f * uLum * (1.0f - uLum) + 0.01f; // Gaussian-ish around 0.5

        int nR = (normalPixels[i] >> 16) & 0xFF;
        int nG = (normalPixels[i] >> 8) & 0xFF;
        int nB = normalPixels[i] & 0xFF;
        float nLum = (nR + nG + nB) / 3.0f / 255.0f;
        float nWeight = 4.0f * nLum * (1.0f - nLum) + 0.01f;

        int oR = (overPixels[i] >> 16) & 0xFF;
        int oG = (overPixels[i] >> 8) & 0xFF;
        int oB = overPixels[i] & 0xFF;
        float oLum = (oR + oG + oB) / 3.0f / 255.0f;
        float oWeight = 4.0f * oLum * (1.0f - oLum) + 0.01f;

        float total = uWeight + nWeight + oWeight;
        int rOut = Math.min(255, Math.round((uR * uWeight + nR * nWeight + oR * oWeight) / total));
        int gOut = Math.min(255, Math.round((uG * uWeight + nG * nWeight + oG * oWeight) / total));
        int bOut = Math.min(255, Math.round((uB * uWeight + nB * nWeight + oB * oWeight) / total));

        resultPixels[i] = 0xFF000000 | (rOut << 16) | (gOut << 8) | bOut;
      }

      under.recycle();
      normal.recycle();
      over.recycle();

      Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
      result.setPixels(resultPixels, 0, w, 0, 0, w, h);

      try (FileOutputStream fos = new FileOutputStream(new File(outputPath))) {
        result.compress(Bitmap.CompressFormat.JPEG, jpegQuality, fos);
      }
      result.recycle();

      long elapsed = System.currentTimeMillis() - startTime;
      Log.d(TAG, "HDR merge complete in " + elapsed + "ms -> " + outputPath);
      return elapsed;

    } catch (Exception e) {
      Log.e(TAG, "HDR merge failed", e);
      return -1;
    }
  }
}
