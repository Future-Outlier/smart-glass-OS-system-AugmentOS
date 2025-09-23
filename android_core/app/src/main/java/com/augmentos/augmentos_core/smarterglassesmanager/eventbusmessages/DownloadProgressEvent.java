package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * EventBus event for download progress updates
 * Used to communicate download status between MentraLiveSGC and AugmentosService
 */
public class DownloadProgressEvent {
    public enum DownloadStatus {
        STARTED,
        PROGRESS,
        FINISHED,
        FAILED
    }

    private final DownloadStatus status;
    private final int progress; // 0-100
    private final long bytesDownloaded;
    private final long totalBytes;
    private final String errorMessage;
    private final long timestamp;

    // Constructor for STARTED status
    public DownloadProgressEvent(DownloadStatus status, long totalBytes) {
        this(status, 0, 0, totalBytes, null);
    }

    // Constructor for PROGRESS status
    public DownloadProgressEvent(DownloadStatus status, int progress, long bytesDownloaded, long totalBytes) {
        this(status, progress, bytesDownloaded, totalBytes, null);
    }

    // Constructor for FINISHED status
    public DownloadProgressEvent(DownloadStatus status, long totalBytes, boolean isFinished) {
        this(status, isFinished ? 100 : 0, totalBytes, totalBytes, null);
    }

    // Constructor for FAILED status
    public DownloadProgressEvent(DownloadStatus status, String errorMessage) {
        this(status, 0, 0, 0, errorMessage);
    }

    // Private constructor for all cases
    private DownloadProgressEvent(DownloadStatus status, int progress, long bytesDownloaded, long totalBytes, String errorMessage) {
        this.status = status;
        this.progress = progress;
        this.bytesDownloaded = bytesDownloaded;
        this.totalBytes = totalBytes;
        this.errorMessage = errorMessage;
        this.timestamp = System.currentTimeMillis();
    }

    public DownloadStatus getStatus() {
        return status;
    }

    public int getProgress() {
        return progress;
    }

    public long getBytesDownloaded() {
        return bytesDownloaded;
    }

    public long getTotalBytes() {
        return totalBytes;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public long getTimestamp() {
        return timestamp;
    }

    @Override
    public String toString() {
        return "DownloadProgressEvent{" +
                "status=" + status +
                ", progress=" + progress +
                ", bytesDownloaded=" + bytesDownloaded +
                ", totalBytes=" + totalBytes +
                ", errorMessage='" + errorMessage + '\'' +
                ", timestamp=" + timestamp +
                '}';
    }
} 