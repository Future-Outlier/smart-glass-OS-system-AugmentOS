// @ts-nocheck
import { SimplePermissionChecker } from '../simple-permission-checker';
import { PermissionType } from '@mentra/sdk';
import { StreamType, createTranscriptionStream, createTranslationStream } from '@mentra/sdk';
import { AppI } from '../../../models/app.model';
import { expect, test, describe, it } from "bun:test";

describe('SimplePermissionChecker', () => {
  // Sample app with various permission configurations
  const createTestApp = (permissions: Array<{ type: PermissionType; description?: string }>): AppI => {
    return {
      packageName: 'test.app',
      name: 'Test App',
      publicUrl: 'http://example.com',
      logoURL: 'http://example.com/logo.png',
      appType: 'standard',
      appStoreStatus: 'DEVELOPMENT',
      permissions,
      isPublic: false,
      hashedApiKey: 'hashedkey',
    } as unknown as AppI;
  };

  describe('getRequiredPermissionForStream', () => {
    it('should return the correct permission for audio streams', () => {
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.AUDIO_CHUNK)).toBe(PermissionType.MICROPHONE);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.TRANSCRIPTION)).toBe(PermissionType.MICROPHONE);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.TRANSLATION)).toBe(PermissionType.MICROPHONE);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.VAD)).toBe(PermissionType.MICROPHONE);
    });

    it('should return the correct permission for location stream', () => {
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.LOCATION_UPDATE)).toBe(PermissionType.LOCATION);
    });

    it('should return the correct permission for calendar stream', () => {
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.CALENDAR_EVENT)).toBe(PermissionType.CALENDAR);
    });

    it('should return the correct permission for notification streams', () => {
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.PHONE_NOTIFICATION)).toBe(PermissionType.READ_NOTIFICATIONS);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.PHONE_NOTIFICATION_DISMISSED)).toBe(PermissionType.READ_NOTIFICATIONS);
    });

    it('should return null for streams that do not require permissions', () => {
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.BUTTON_PRESS)).toBeNull();
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.HEAD_POSITION)).toBeNull();
      expect(SimplePermissionChecker.getRequiredPermissionForStream(StreamType.OPEN_DASHBOARD)).toBeNull();
    });

    it('should return the correct permission for language-specific streams', () => {
      const enTranscription = createTranscriptionStream('en-US');
      const frTranscription = createTranscriptionStream('fr-FR');
      const translation = createTranslationStream('es-ES', 'en-US');

      expect(SimplePermissionChecker.getRequiredPermissionForStream(enTranscription)).toBe(PermissionType.MICROPHONE);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(frTranscription)).toBe(PermissionType.MICROPHONE);
      expect(SimplePermissionChecker.getRequiredPermissionForStream(translation)).toBe(PermissionType.MICROPHONE);
    });
  });

  describe('hasPermission', () => {
    it('should return true when app has the specific permission', () => {
      const app = createTestApp([{ type: PermissionType.MICROPHONE }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.MICROPHONE)).toBe(true);
    });

    it('should return false when app does not have the specific permission', () => {
      const app = createTestApp([{ type: PermissionType.LOCATION }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.MICROPHONE)).toBe(false);
    });

    it('should return true for any permission when app has ALL permission', () => {
      const app = createTestApp([{ type: PermissionType.ALL }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.MICROPHONE)).toBe(true);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.LOCATION)).toBe(true);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.CALENDAR)).toBe(true);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.READ_NOTIFICATIONS)).toBe(true);
    });

    it('should return false when app has no permissions defined', () => {
      const app = createTestApp([]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.MICROPHONE)).toBe(false);
    });

    // Legacy permission compatibility tests
    it('should allow READ_NOTIFICATIONS when app has legacy NOTIFICATIONS permission', () => {
      const app = createTestApp([{ type: PermissionType.NOTIFICATIONS }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.READ_NOTIFICATIONS)).toBe(true);
    });

    it('should NOT allow POST_NOTIFICATIONS when app has legacy NOTIFICATIONS permission', () => {
      const app = createTestApp([{ type: PermissionType.NOTIFICATIONS }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.POST_NOTIFICATIONS)).toBe(false);
    });

    it('should allow direct READ permission with new READ_notifications', () => {
      const app = createTestApp([{ type: PermissionType.READ_NOTIFICATIONS }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.READ_NOTIFICATIONS)).toBe(true);
    });

    it('should allow direct post permission with new post_notifications', () => {
      const app = createTestApp([{ type: PermissionType.POST_NOTIFICATIONS }]);
      expect(SimplePermissionChecker.hasPermission(app, PermissionType.POST_NOTIFICATIONS)).toBe(true);
    });
  });

  describe('filterSubscriptions', () => {
    it('should allow all streams that do not require permissions', () => {
      const app = createTestApp([]);
      const subscriptions = [
        StreamType.BUTTON_PRESS,
        StreamType.HEAD_POSITION,
        StreamType.OPEN_DASHBOARD
      ];

      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(app, subscriptions);
      expect(allowed).toEqual(subscriptions);
      expect(rejected).toEqual([]);
    });

    it('should filter out streams that require undeclared permissions', () => {
      const app = createTestApp([{ type: PermissionType.LOCATION }]);
      const subscriptions = [
        StreamType.BUTTON_PRESS,       // No permission required
        StreamType.LOCATION_UPDATE,    // Has LOCATION permission
        StreamType.AUDIO_CHUNK,        // No MICROPHONE permission
        StreamType.CALENDAR_EVENT      // No CALENDAR permission
      ];

      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(app, subscriptions);
      expect(allowed).toEqual([
        StreamType.BUTTON_PRESS,
        StreamType.LOCATION_UPDATE
      ]);
      expect(rejected).toEqual([
        { stream: StreamType.AUDIO_CHUNK, requiredPermission: PermissionType.MICROPHONE },
        { stream: StreamType.CALENDAR_EVENT, requiredPermission: PermissionType.CALENDAR }
      ]);
    });

    it('should allow all streams when app has ALL permission', () => {
      const app = createTestApp([{ type: PermissionType.ALL }]);
      const subscriptions = [
        StreamType.BUTTON_PRESS,
        StreamType.LOCATION_UPDATE,
        StreamType.AUDIO_CHUNK,
        StreamType.CALENDAR_EVENT,
        StreamType.PHONE_NOTIFICATION,
        StreamType.PHONE_NOTIFICATION_DISMISSED
      ];

      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(app, subscriptions);
      expect(allowed).toEqual(subscriptions);
      expect(rejected).toEqual([]);
    });

    it('should properly filter language-specific streams', () => {
      const app = createTestApp([{ type: PermissionType.LOCATION }]);
      const subscriptions = [
        createTranscriptionStream('en-US'),  // No MICROPHONE permission
        StreamType.LOCATION_UPDATE           // Has LOCATION permission
      ];

      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(app, subscriptions);
      expect(allowed).toEqual([StreamType.LOCATION_UPDATE]);
      expect(rejected.length).toBe(1);
      expect(rejected[0].requiredPermission).toBe(PermissionType.MICROPHONE);
    });

    it('should allow notification streams for apps with legacy NOTIFICATIONS permission', () => {
      const app = createTestApp([{ type: PermissionType.NOTIFICATIONS }]);
      const subscriptions = [
        StreamType.PHONE_NOTIFICATION,
        StreamType.PHONE_NOTIFICATION_DISMISSED
      ];

      const { allowed, rejected } = SimplePermissionChecker.filterSubscriptions(app, subscriptions);
      expect(allowed).toEqual(subscriptions);
      expect(rejected).toEqual([]);
    });
  });

  describe('normalizePermissions', () => {
    it('should convert legacy NOTIFICATIONS to READ_NOTIFICATIONS', () => {
      const legacyPermissions = [
        { type: PermissionType.NOTIFICATIONS, description: 'Legacy notification access' },
        { type: PermissionType.MICROPHONE, description: 'Microphone access' }
      ];

      const normalized = SimplePermissionChecker.normalizePermissions(legacyPermissions);

      expect(normalized).toHaveLength(2);
      expect(normalized[0].type).toBe(PermissionType.READ_NOTIFICATIONS);
      expect(normalized[0].description).toBe('Legacy notification access');
      expect(normalized[1].type).toBe(PermissionType.MICROPHONE);
    });

    it('should not duplicate permissions when normalizing', () => {
      const mixedPermissions = [
        { type: PermissionType.NOTIFICATIONS, description: 'Legacy' },
        { type: PermissionType.READ_NOTIFICATIONS, description: 'Direct' },
        { type: PermissionType.MICROPHONE }
      ];

      const normalized = SimplePermissionChecker.normalizePermissions(mixedPermissions);

      expect(normalized).toHaveLength(2);
      expect(normalized.map(p => p.type)).toContain(PermissionType.READ_NOTIFICATIONS);
      expect(normalized.map(p => p.type)).toContain(PermissionType.MICROPHONE);
    });

    it('should add default description for legacy permissions without description', () => {
      const legacyPermissions = [
        { type: PermissionType.NOTIFICATIONS }
      ];

      const normalized = SimplePermissionChecker.normalizePermissions(legacyPermissions);

      expect(normalized[0].description).toBe('Read phone notifications');
    });
  });
});