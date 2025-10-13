package com.mentra.core.services

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.text.TextUtils

class NotificationListener private constructor(private val context: Context) {

    companion object {
        @Volatile private var instance: NotificationListener? = null

        fun getInstance(context: Context): NotificationListener {
            return instance
                    ?: synchronized(this) {
                        instance
                                ?: NotificationListener(context.applicationContext).also {
                                    instance = it
                                }
                    }
        }
    }

    private val listeners = mutableListOf<OnNotificationReceivedListener>()

    /** Check if notification listener permission is granted */
    fun hasNotificationListenerPermission(): Boolean {
        val packageName = context.packageName
        val flat =
                Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")

        if (!TextUtils.isEmpty(flat)) {
            val names = flat.split(":")
            for (name in names) {
                val componentName = ComponentName.unflattenFromString(name)
                if (componentName != null) {
                    if (TextUtils.equals(packageName, componentName.packageName)) {
                        return true
                    }
                }
            }
        }
        return false
    }

    /** Open notification listener settings */
    fun openNotificationListenerSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /** Add a listener for notifications */
    fun addListener(listener: OnNotificationReceivedListener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    /** Remove a listener */
    fun removeListener(listener: OnNotificationReceivedListener) {
        listeners.remove(listener)
    }

    /** Called internally by the service when a notification is posted */
    internal fun onNotificationPosted(sbn: StatusBarNotification) {
        val notification =
                NotificationData(
                        packageName = sbn.packageName,
                        title = sbn.notification.extras.getString("android.title") ?: "",
                        text = sbn.notification.extras.getCharSequence("android.text")?.toString()
                                        ?: "",
                        timestamp = sbn.postTime,
                        id = sbn.id,
                        tag = sbn.tag
                )

        listeners.forEach { listener -> listener.onNotificationReceived(notification) }
    }

    /** Called internally by the service when a notification is removed */
    internal fun onNotificationRemoved(sbn: StatusBarNotification) {
        listeners.forEach { listener -> listener.onNotificationRemoved(sbn.packageName, sbn.id) }
    }

    /** Interface for notification callbacks */
    interface OnNotificationReceivedListener {
        fun onNotificationReceived(notification: NotificationData)
        fun onNotificationRemoved(packageName: String, notificationId: Int) {}
    }

    /** Data class for notification info */
    data class NotificationData(
            val packageName: String,
            val title: String,
            val text: String,
            val timestamp: Long,
            val id: Int,
            val tag: String?
    )
}

/** The actual NotificationListenerService implementation */
class NotificationListenerServiceImpl : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)
        NotificationListener.getInstance(applicationContext).onNotificationPosted(sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        super.onNotificationRemoved(sbn)
        NotificationListener.getInstance(applicationContext).onNotificationRemoved(sbn)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        // Service is connected and ready
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        // Service was disconnected, request rebind
        requestRebind(ComponentName(this, NotificationListenerServiceImpl::class.java))
    }
}
