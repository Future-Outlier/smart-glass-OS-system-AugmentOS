import {
  StreamType,
  ExtendedStreamType,
  isLanguageStream,
  parseLanguageStream,
  createTranscriptionStream,
  SubscriptionRequest,
} from "@mentra/sdk";
import { Logger } from "pino";
import UserSession from "./UserSession";
import App from "../../models/app.model";
import { SimplePermissionChecker } from "../permissions/simple-permission-checker";
import { User, UserI } from "../../models/user.model";
import { MongoSanitizer } from "../../utils/mongoSanitizer";

/**
 * SubscriptionManager coordinates subscriptions across all apps in a user session.
 *
 * Phase 4c: Per-app subscription storage is now delegated to AppSession instances.
 * SubscriptionManager maintains cross-app aggregates and coordinates with other managers.
 *
 * Single Source of Truth:
 * - Per-app subscriptions: AppSession._subscriptions (via AppManager)
 * - Cross-app aggregates: SubscriptionManager (appsWithPCM, appsWithTranscription, languageStreamCounts)
 */
export class SubscriptionManager {
  private readonly userSession: UserSession;
  private readonly logger: Logger;

  // NOTE: Per-app subscriptions are now stored in AppSession (Phase 4c)
  // Access via: this.userSession.appManager.getAppSession(packageName)?.subscriptions
  // The following Maps have been removed:
  // - subscriptions: Map<string, Set<ExtendedStreamType>> → AppSession._subscriptions
  // - history: Map<string, {...}[]> → AppSession.subscriptionHistory
  // - lastAppReconnectAt: Map<string, number> → AppSession._lastReconnectAt

  // Per-app update serialization (mutex/queue) - kept for serializing async operations
  private updateChainsByApp: Map<string, Promise<unknown>> = new Map();

  // Cached aggregates for O(1) reads - track which apps need what
  // These remain in SubscriptionManager as they span multiple apps
  private appsWithPCM = new Set<string>(); // packageNames that need PCM
  private appsWithTranscription = new Set<string>(); // packageNames that need transcription/translation
  private languageStreamCounts: Map<ExtendedStreamType, number> = new Map();

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "SubscriptionManager" });
    this.logger.info(
      { userId: userSession.userId },
      "SubscriptionManager initialized",
    );
  }

  // ===== Public API =====

  /**
   * Mark an app as reconnected (for grace period handling)
   * NOTE: This is now handled by AppSession.handleConnect() which sets _lastReconnectAt
   * This method is kept for backward compatibility but delegates to AppSession
   */
  markAppReconnected(packageName: string): void {
    // AppSession.handleConnect() already sets _lastReconnectAt when connection is established
    // This is a no-op now, but kept for API compatibility
    this.logger.debug(
      { packageName },
      "markAppReconnected called - handled by AppSession.handleConnect()",
    );
  }

  /**
   * Get subscriptions for a specific app (delegates to AppSession)
   */
  getAppSubscriptions(packageName: string): ExtendedStreamType[] {
    const appSession = this.userSession.appManager.getAppSession(packageName);
    const result = appSession?.getSubscriptions() ?? [];
    this.logger.debug(
      { userId: this.userSession.userId, packageName, subscriptions: result },
      "Retrieved app subscriptions from AppSession",
    );
    return result;
  }

  /**
   * Check if an app has a specific subscription (delegates to AppSession)
   */
  hasSubscription(packageName: string, subscription: StreamType): boolean {
    const appSession = this.userSession.appManager.getAppSession(packageName);
    if (!appSession) return false;
    return appSession.hasSubscription(subscription);
  }

  /**
   * Get all apps subscribed to a specific stream type
   * Iterates through all AppSessions to find matches
   */
  getSubscribedApps(subscription: ExtendedStreamType): string[] {
    const subscribedApps: string[] = [];

    // Parse the incoming subscription to get base type and language
    const incomingParsed = isLanguageStream(subscription as string)
      ? parseLanguageStream(subscription as string)
      : null;

    // Iterate through all AppSessions via AppManager
    for (const [packageName, appSession] of this.getAppSessionEntries()) {
      const subs = appSession.subscriptions;
      for (const sub of subs) {
        if (
          sub === subscription ||
          sub === StreamType.ALL ||
          sub === StreamType.WILDCARD
        ) {
          subscribedApps.push(packageName);
          break;
        }

        // For language streams, compare base type and language (ignore query params like ?hints=)
        if (incomingParsed && isLanguageStream(sub as string)) {
          const subParsed = parseLanguageStream(sub as string);
          if (
            subParsed &&
            subParsed.type === incomingParsed.type &&
            subParsed.transcribeLanguage === incomingParsed.transcribeLanguage
          ) {
            subscribedApps.push(packageName);
            break;
          }
        }

        // Back-compat: location_stream implies location_update
        if (
          subscription === StreamType.LOCATION_UPDATE &&
          sub === StreamType.LOCATION_STREAM
        ) {
          subscribedApps.push(packageName);
          break;
        }
      }
    }
    return subscribedApps;
  }

  /**
   * Get all apps subscribed to a specific AugmentOS setting
   */
  getSubscribedAppsForAugmentosSetting(settingKey: string): string[] {
    const subscribed: string[] = [];
    const target = `augmentos:${settingKey}`;

    // Iterate through all AppSessions via AppManager
    for (const [packageName, appSession] of this.getAppSessionEntries()) {
      const subs = appSession.subscriptions;
      for (const sub of subs) {
        if (
          sub === target ||
          sub === ("augmentos:*" as any) ||
          sub === ("augmentos:all" as any)
        ) {
          subscribed.push(packageName);
          break;
        }
      }
    }
    this.logger.info(
      { userId: this.userSession.userId, settingKey, subscribed },
      "AugmentOS setting subscription results",
    );
    return subscribed;
  }

  getMinimalLanguageSubscriptions(): ExtendedStreamType[] {
    const result: ExtendedStreamType[] = [];
    for (const [langStream, count] of this.languageStreamCounts.entries()) {
      if (count > 0) result.push(langStream);
    }
    return result;
  }

  hasPCMTranscriptionSubscriptions(): {
    hasMedia: boolean;
    hasPCM: boolean;
    hasTranscription: boolean;
  } {
    const hasPCM = this.appsWithPCM.size > 0;
    const hasTranscription = this.appsWithTranscription.size > 0;
    const hasMedia = hasPCM || hasTranscription;

    this.logger.debug(
      {
        appsWithPCM: Array.from(this.appsWithPCM),
        appsWithTranscription: Array.from(this.appsWithTranscription),
        hasPCM,
        hasTranscription,
        hasMedia,
      },
      "hasPCMTranscriptionSubscriptions called",
    );

    return { hasMedia, hasPCM, hasTranscription };
  }

  /**
   * Update subscriptions for an app
   * Validates permissions, then delegates storage to AppSession
   */
  async updateSubscriptions(
    packageName: string,
    subscriptions: SubscriptionRequest[],
  ): Promise<UserI | null> {
    // Serialize per-app updates via promise chaining
    const previous =
      this.updateChainsByApp.get(packageName) || Promise.resolve();
    let resultUser: UserI | null = null;

    const chained = previous.then(async () => {
      // Get or create AppSession for this app
      const appSession =
        this.userSession.appManager.getOrCreateAppSession(packageName);

      // Process incoming subscriptions array (strings and special location objects)
      const streamSubscriptions: ExtendedStreamType[] = [];
      let locationRate: string | null = null;
      for (const sub of subscriptions) {
        if (
          typeof sub === "object" &&
          sub !== null &&
          "stream" in sub &&
          (sub as any).stream === StreamType.LOCATION_STREAM
        ) {
          locationRate = (sub as any).rate || null;
          streamSubscriptions.push(StreamType.LOCATION_STREAM);
        } else if (typeof sub === "string") {
          streamSubscriptions.push(sub as ExtendedStreamType);
        }
      }

      const processed: ExtendedStreamType[] = streamSubscriptions.map((sub) =>
        sub === StreamType.TRANSCRIPTION
          ? createTranscriptionStream("en-US")
          : sub,
      );

      // Validate permissions (best-effort)
      let allowedProcessed: ExtendedStreamType[] = processed;
      try {
        const app = await App.findOne({ packageName });
        if (app) {
          const { allowed, rejected } =
            SimplePermissionChecker.filterSubscriptions(app, processed);
          if (rejected.length > 0) {
            this.logger.warn(
              {
                userId: this.userSession.userId,
                packageName,
                rejectedCount: rejected.length,
              },
              "Rejected subscriptions due to missing permissions",
            );
          }
          allowedProcessed = allowed;
        }
      } catch (error) {
        const logger = this.logger.child({ packageName });
        logger.error(error, "Error validating subscriptions; continuing");
      }

      // Get old subscriptions for delta computation (from AppSession)
      const oldSet = appSession.subscriptions;

      // Delegate to AppSession for storage and grace period handling
      // AppSession.updateSubscriptions() handles the empty-subscription grace window internally
      const updateResult = appSession.updateSubscriptions(allowedProcessed);

      if (!updateResult.applied) {
        this.logger.info(
          {
            userId: this.userSession.userId,
            packageName,
            reason: updateResult.reason,
          },
          "Subscription update not applied by AppSession",
        );
        resultUser = await this.persistLocationRate(packageName, locationRate);
        return; // Skip further processing
      }

      // Get new subscriptions after update (from AppSession)
      const newSet = appSession.subscriptions;

      // Update cross-app aggregates
      this.applyDelta(packageName, oldSet, newSet);

      this.logger.info(
        {
          userId: this.userSession.userId,
          packageName,
          processedSubscriptions: [...newSet],
        },
        "Updated subscriptions successfully via AppSession",
      );

      // Sync managers and mic
      await this.syncManagers();
      this.userSession.microphoneManager?.handleSubscriptionChange();

      // Persist location rate setting for this app
      resultUser = await this.persistLocationRate(packageName, locationRate);
    });

    // Store chain and return when this link finishes
    this.updateChainsByApp.set(
      packageName,
      chained.catch((error) => {
        const _logger = this.logger.child({ packageName });
        _logger.error(error, "Error in subscription update chain");
      }),
    );
    await chained;
    return resultUser;
  }

  /**
   * Remove all subscriptions for an app (delegates to AppSession)
   */
  async removeSubscriptions(packageName: string): Promise<UserI | null> {
    const appSession = this.userSession.appManager.getAppSession(packageName);
    if (appSession) {
      const existing = appSession.subscriptions;
      if (existing.size > 0) {
        // Apply delta to aggregates before clearing
        this.applyDelta(packageName, existing, new Set<ExtendedStreamType>());

        // Delegate clearing to AppSession
        appSession.clearSubscriptions();

        this.logger.info(
          { userId: this.userSession.userId, packageName },
          "Removed subscriptions for app via AppSession",
        );
      }
    }

    // Notify managers about unsubscribe
    this.userSession.locationManager.handleUnsubscribe(packageName);
    this.userSession.calendarManager.handleUnsubscribe(packageName);

    await this.syncManagers();
    this.userSession.microphoneManager?.handleSubscriptionChange();

    // Clear location rate for this app in DB
    try {
      const user = await User.findOne({ email: this.userSession.userId });
      if (user) {
        const sanitizedPackage = MongoSanitizer.sanitizeKey(packageName);
        if (user.locationSubscriptions?.has(sanitizedPackage)) {
          user.locationSubscriptions.delete(sanitizedPackage);
          user.markModified("locationSubscriptions");
          await user.save();
        }
        return user;
      }
    } catch (error) {
      const logger = this.logger.child({ packageName });
      logger.error(error, "Error removing location subscription from DB");
    }
    return null;
  }

  /**
   * Get subscription history for an app (delegates to AppSession)
   */
  getHistory(packageName: string) {
    const appSession = this.userSession.appManager.getAppSession(packageName);
    return appSession?.getSubscriptionHistory() ?? [];
  }

  /**
   * Clean up SubscriptionManager state
   * Note: Per-app subscriptions are now managed by AppSession and cleaned up via AppManager
   */
  dispose(): void {
    // Clear cross-app aggregates
    this.appsWithPCM.clear();
    this.appsWithTranscription.clear();
    this.languageStreamCounts.clear();
    this.updateChainsByApp.clear();

    this.logger.debug("SubscriptionManager disposed");
  }

  // ===== Private helpers =====

  /**
   * Get all AppSession entries from AppManager
   * Helper for iterating through all app subscriptions
   */
  private getAppSessionEntries(): [
    string,
    { subscriptions: Set<ExtendedStreamType> },
  ][] {
    const entries: [string, { subscriptions: Set<ExtendedStreamType> }][] = [];
    const appSessions = this.userSession.appManager.getAllAppSessions();
    for (const [packageName, appSession] of appSessions.entries()) {
      entries.push([packageName, appSession]);
    }
    return entries;
  }

  /**
   * Deprecated: No longer persist location subscriptions to DB
   * Location subscriptions are now tracked in-memory only
   */
  private async persistLocationRate(
    _packageName: string,
    _locationRate: string | null,
  ): Promise<UserI | null> {
    // No-op: location subscriptions are now in-memory only
    // This method is kept for backward compatibility during migration
    return null;
  }

  /**
   * Extract location subscriptions from all app subscriptions.
   * Returns lightweight data for LocationManager to process.
   */
  private getLocationSubscriptions(): Array<{
    packageName: string;
    rate: string;
  }> {
    const result: Array<{ packageName: string; rate: string }> = [];

    for (const [packageName, appSession] of this.getAppSessionEntries()) {
      const subs = appSession.subscriptions;
      for (const sub of subs) {
        // Check for location_stream subscription objects
        if (
          typeof sub === "object" &&
          sub !== null &&
          "stream" in sub &&
          (sub as any).stream === StreamType.LOCATION_STREAM
        ) {
          const rate = (sub as any).rate;
          if (rate) {
            result.push({ packageName, rate });
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract calendar subscriptions from all app subscriptions.
   * Returns list of package names subscribed to calendar events.
   */
  private getCalendarSubscriptions(): string[] {
    const result: string[] = [];

    for (const [packageName, appSession] of this.getAppSessionEntries()) {
      if (appSession.subscriptions.has(StreamType.CALENDAR_EVENT)) {
        result.push(packageName);
      }
    }

    return result;
  }

  /**
   * Get all transcription subscriptions across all apps
   */
  private getTranscriptionSubscriptions(): ExtendedStreamType[] {
    const subs: ExtendedStreamType[] = [];
    for (const [, appSession] of this.getAppSessionEntries()) {
      for (const sub of appSession.subscriptions) {
        if (
          typeof sub === "string" &&
          sub.includes("transcription") &&
          !sub.includes("translation")
        ) {
          subs.push(sub);
        }
      }
    }
    return subs;
  }

  /**
   * Get all translation subscriptions across all apps
   */
  private getTranslationSubscriptions(): ExtendedStreamType[] {
    const subs: ExtendedStreamType[] = [];
    for (const [, appSession] of this.getAppSessionEntries()) {
      for (const sub of appSession.subscriptions) {
        if (typeof sub === "string" && sub.includes("translation")) {
          subs.push(sub);
        }
      }
    }
    return subs;
  }

  private async syncManagers(): Promise<void> {
    try {
      const transcriptionSubs = this.getTranscriptionSubscriptions();
      await this.userSession.transcriptionManager.updateSubscriptions(
        transcriptionSubs,
      );
      const translationSubs = this.getTranslationSubscriptions();
      await this.userSession.translationManager.updateSubscriptions(
        translationSubs,
      );

      await Promise.all([
        this.userSession.transcriptionManager.ensureStreamsExist(),
        this.userSession.translationManager.ensureStreamsExist(),
      ]);

      // Pass location subscriptions to LocationManager for tier computation + relay
      const locationSubs = this.getLocationSubscriptions();
      this.userSession.locationManager.handleSubscriptionUpdate(locationSubs);

      // Pass calendar subscriptions to CalendarManager for relay
      const calendarSubs = this.getCalendarSubscriptions();
      this.userSession.calendarManager.handleSubscriptionUpdate(calendarSubs);
    } catch (error) {
      const logger = this.logger.child({ userId: this.userSession.userId });
      logger.error(error, "Error syncing managers with subscriptions");
    }
  }

  /**
   * Apply delta between old and new subscription sets to cached aggregates
   */
  private applyDelta(
    packageName: string,
    oldSet: Set<ExtendedStreamType>,
    newSet: Set<ExtendedStreamType>,
  ): void {
    this.logger.debug(
      {
        packageName,
        oldCount: oldSet.size,
        newCount: newSet.size,
        oldSubs: Array.from(oldSet),
        newSubs: Array.from(newSet),
      },
      "applyDelta called",
    );

    // Determine if this app needs transcription/PCM before and after
    const oldHasTranscription = this.hasTranscriptionLike(oldSet);
    const newHasTranscription = this.hasTranscriptionLike(newSet);
    const oldHasPCM = oldSet.has(StreamType.AUDIO_CHUNK);
    const newHasPCM = newSet.has(StreamType.AUDIO_CHUNK);

    // Update app tracking sets
    if (oldHasTranscription && !newHasTranscription) {
      this.appsWithTranscription.delete(packageName);
      this.logger.debug(
        { packageName, appsRemaining: this.appsWithTranscription.size },
        "App removed from transcription set",
      );
    } else if (!oldHasTranscription && newHasTranscription) {
      this.appsWithTranscription.add(packageName);
      this.logger.debug(
        { packageName, appsTotal: this.appsWithTranscription.size },
        "App added to transcription set",
      );
    }

    if (oldHasPCM && !newHasPCM) {
      this.appsWithPCM.delete(packageName);
      this.logger.debug(
        { packageName, appsRemaining: this.appsWithPCM.size },
        "App removed from PCM set",
      );
    } else if (!oldHasPCM && newHasPCM) {
      this.appsWithPCM.add(packageName);
      this.logger.debug(
        { packageName, appsTotal: this.appsWithPCM.size },
        "App added to PCM set",
      );
    }

    // Still update language stream counts for detailed tracking
    for (const sub of oldSet) {
      if (!newSet.has(sub) && isLanguageStream(sub)) {
        const prev = this.languageStreamCounts.get(sub) || 0;
        const next = prev - 1;
        if (next <= 0) this.languageStreamCounts.delete(sub);
        else this.languageStreamCounts.set(sub, next);
      }
    }
    for (const sub of newSet) {
      if (!oldSet.has(sub) && isLanguageStream(sub)) {
        const prev = this.languageStreamCounts.get(sub) || 0;
        this.languageStreamCounts.set(sub, prev + 1);
      }
    }

    this.logger.debug(
      {
        packageName,
        appsWithTranscription: Array.from(this.appsWithTranscription),
        appsWithPCM: Array.from(this.appsWithPCM),
      },
      "applyDelta completed - current state",
    );
  }

  /**
   * Check if a set of subscriptions contains transcription-like streams
   */
  private hasTranscriptionLike(subs: Set<ExtendedStreamType>): boolean {
    for (const sub of subs) {
      if (sub === StreamType.TRANSCRIPTION || sub === StreamType.TRANSLATION) {
        return true;
      }
      if (isLanguageStream(sub)) {
        const info = parseLanguageStream(sub as string);
        if (
          info &&
          (info.type === StreamType.TRANSCRIPTION ||
            info.type === StreamType.TRANSLATION)
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

export default SubscriptionManager;
