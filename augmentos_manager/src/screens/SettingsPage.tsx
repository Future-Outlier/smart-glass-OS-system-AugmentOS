import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Slider } from 'react-native-elements';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';

import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import coreCommunicator from '../bridge/CoreCommunicator';
import { stopExternalService } from '../bridge/CoreServiceStarter';
import CoreCommsService from '../bridge/CoreCommsService';
import { loadSetting, saveSetting } from '../logic/SettingsHelper.tsx';
import NavigationBar from '../components/NavigationBar';

import { SETTINGS_KEYS } from '../consts';
import { supabase } from '../supabaseClient';

interface SettingsPageProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const parseBrightness = (brightnessStr: string | null | undefined): number => {
  if (!brightnessStr || brightnessStr.includes('-')) {
    return 50;
  }
  const parsed = parseInt(brightnessStr.replace('%', ''), 10);
  return isNaN(parsed) ? 50 : parsed;
};

const SettingsPage: React.FC<SettingsPageProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const { status } = useStatus();

  // -- Basic states from your original code --
  const [isDoNotDisturbEnabled, setDoNotDisturbEnabled] = useState(false);
  const [isBrightnessAutoEnabled, setBrightnessAutoEnabled] = useState(false);
  const [isSensingEnabled, setIsSensingEnabled] = useState(status.core_info.sensing_enabled);
  const [forceCoreOnboardMic, setForceCoreOnboardMic] = useState(
    status.core_info.force_core_onboard_mic
  );
  const [isAlwaysOnStatusBarEnabled, setIsAlwaysOnStatusBarEnabled] = useState(
    status.core_info.always_on_status_bar_enabled
  );
  const [brightness, setBrightness] = useState<number|null>(null);

  // -- Handlers for toggles, etc. --
  const toggleSensing = async () => {
    const newSensing = !isSensingEnabled;
    await coreCommunicator.sendToggleSensing(newSensing);
    setIsSensingEnabled(newSensing);
  };

  const toggleForceCoreOnboardMic = async () => {
    const newVal = !forceCoreOnboardMic;
    await coreCommunicator.sendToggleForceCoreOnboardMic(newVal);
    setForceCoreOnboardMic(newVal);
  };

  const toggleAlwaysOnStatusBar = async () => {
    const newVal = !isAlwaysOnStatusBarEnabled;
    await coreCommunicator.sendToggleAlwaysOnStatusBar(newVal);
    setIsAlwaysOnStatusBarEnabled(newVal);
  };

  useEffect(() => {
    if (status.glasses_info) {
      if (status.glasses_info?.brightness != null) {
        setBrightness(parseBrightness(status.glasses_info.brightness));
      }
    }
  }, [status.glasses_info?.brightness, status.glasses_info]);

  const changeBrightness = async (newBrightness: number) => {
    if (!status.glasses_info) {
      Alert.alert('Glasses not connected', 'Please connect your smart glasses first.');
      return;
    }

    if (newBrightness == null) {
        return;
    }

    if (status.glasses_info.brightness === '-') {return;} // or handle accordingly
    await coreCommunicator.setGlassesBrightnessMode(newBrightness, false);
    setBrightness(newBrightness);
  };


  const forgetGlasses = async () => {
    await coreCommunicator.sendForgetSmartGlasses();
  };

  const confirmForgetGlasses = () => {
    Alert.alert(
      'Forget Glasses',
      'Are you sure you want to forget your glasses?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: forgetGlasses },
      ],
      { cancelable: false }
    );
  };

  const handleSignOut = async () => {
    try {
      // Try to sign out with Supabase - may fail in offline mode
      await supabase.auth.signOut().catch(err => {
        console.log('Supabase sign-out failed, continuing with local cleanup:', err);
      });

      // Completely clear ALL Supabase Auth storage
      // This is critical to ensure user is redirected to login screen even when offline
      await AsyncStorage.removeItem('supabase.auth.token');
      await AsyncStorage.removeItem('supabase.auth.refreshToken');
      await AsyncStorage.removeItem('supabase.auth.session');
      await AsyncStorage.removeItem('supabase.auth.expires_at');
      await AsyncStorage.removeItem('supabase.auth.expires_in');
      await AsyncStorage.removeItem('supabase.auth.provider_token');
      await AsyncStorage.removeItem('supabase.auth.provider_refresh_token');

      // Clear any other user-related storage that might prevent proper logout
      const allKeys = await AsyncStorage.getAllKeys();
      const userKeys = allKeys.filter(key =>
        key.startsWith('supabase.auth.') ||
        key.includes('user') ||
        key.includes('token')
      );

      if (userKeys.length > 0) {
        await AsyncStorage.multiRemove(userKeys);
      }

      // Clean up other services
      console.log('Cleaning up local sessions and services');
      
      // Delete core auth key
      await coreCommunicator.deleteAuthenticationSecretKey();
      
      // Stop the native services
      CoreCommsService.stopService();
      stopExternalService();
      
      // Clean up communicator resources
      coreCommunicator.cleanup();
      
      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      navigation.reset({
        index: 0,
        routes: [{ name: 'SplashScreen' }],
      });
    } catch (err) {
      console.error('Error during sign-out:', err);
      // Even if there's an error, still try to navigate away to login
      navigation.reset({
        index: 0,
        routes: [{ name: 'SplashScreen' }],
      });
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: handleSignOut },
      ],
      { cancelable: false }
    );
  };


  // Switch track colors
  const switchColors = {
    trackColor: {
      false: isDarkTheme ? '#666666' : '#D1D1D6',
      true: '#2196F3',
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDarkTheme ? '#666666' : '#D1D1D6',
  };

  // Theming
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    subTextColor: isDarkTheme ? '#999999' : '#666666',
    cardBg: isDarkTheme ? '#333333' : '#fff',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    searchBg: isDarkTheme ? '#2c2c2c' : '#f5f5f5',
    categoryChipBg: isDarkTheme ? '#444444' : '#e9e9e9',
    categoryChipText: isDarkTheme ? '#FFFFFF' : '#555555',
    selectedChipBg: isDarkTheme ? '#666666' : '#333333',
    selectedChipText: isDarkTheme ? '#FFFFFF' : '#FFFFFF',
  };


 // Fixed slider props to avoid warning
 const sliderProps = {
  disabled: !status.glasses_info?.model_name ||
           status.glasses_info?.brightness === '-' ||
           !status.glasses_info.model_name.toLowerCase().includes('even'),
  style: styles.slider,
  minimumValue: 0,
  maximumValue: 100,
  step: 1,
  onSlidingComplete: (value: number) => changeBrightness(value),
  value: brightness ?? 50,
  minimumTrackTintColor: styles.minimumTrackTintColor.color,
  maximumTrackTintColor: isDarkTheme
    ? styles.maximumTrackTintColorDark.color
    : styles.maximumTrackTintColorLight.color,
  thumbTintColor: styles.thumbTintColor.color,
  // Using inline objects instead of defaultProps
  thumbTouchSize: { width: 40, height: 40 },
  trackStyle: { height: 5 },
  thumbStyle: { height: 20, width: 20 }
};

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}
    >
      {/* Title Section */}
      <View
        style={[
          styles.titleContainer,
          isDarkTheme ? styles.titleContainerDark : styles.titleContainerLight,
        ]}
      >
        <Text
          style={[
            styles.title,
            isDarkTheme ? styles.lightText : styles.darkText,
          ]}
        >
          Settings
        </Text>
      </View>

      <ScrollView style={styles.scrollViewContainer}>
        {/* Force Onboard Microphone */}
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
                // (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                //   styles.disabledItem,
              ]}
            >
              Force Phone Microphone
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                // (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                //   styles.disabledItem,
              ]}
            >
              Force the use of the phone's microphone instead of the glasses' microphone (if applicable).
            </Text>
          </View>
          <Switch
            //disabled={!status.glasses_info?.model_name}
            value={forceCoreOnboardMic}
            onValueChange={toggleForceCoreOnboardMic}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>

        {/* Always on time, date and battery */}
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Always On Status Bar (Beta Feature)
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
              ]}
            >
              Always show the time, date and battery level on your smart glasses.
            </Text>
          </View>
          <Switch
            value={isAlwaysOnStatusBarEnabled}
            onValueChange={toggleAlwaysOnStatusBar}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>

        {/* Privacy Settings */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            navigation.navigate('PrivacySettingsScreen');
          }}
        >
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Privacy Settings
            </Text>
          </View>
          <Icon
            name="angle-right"
            size={20}
            color={isDarkTheme ? styles.lightIcon.color : styles.darkIcon.color}
          />
        </TouchableOpacity>

        {/* Dashboard Settings */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            navigation.navigate('DashboardSettingsScreen', {
              isDarkTheme,
              toggleTheme,
            });
          }}
        >
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Dashboard Settings
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
              ]}
            >
              Configure the contextual dashboard and HeadUp settings
            </Text>
          </View>
          <Icon
            name="angle-right"
            size={20}
            color={isDarkTheme ? styles.lightIcon.color : styles.darkIcon.color}
          />
        </TouchableOpacity>

               {/* Brightness Slider */}
               <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                  styles.disabledItem,
              ]}
            >
              Brightness
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                  styles.disabledItem,
              ]}
            >
              Adjust the brightness level of your smart glasses.
            </Text>
            <Slider
              {...sliderProps}
            />
          </View>
        </View>

        {/* Developer Settings */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            navigation.navigate('DeveloperSettingsScreen');
          }}
        >
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Developer Settings
            </Text>
          </View>
          <Icon
            name="angle-right"
            size={20}
            color={isDarkTheme ? styles.lightIcon.color : styles.darkIcon.color}
          />
        </TouchableOpacity>

        {/* Bug Report */}
        {/* <TouchableOpacity style={styles.settingItem} onPress={() => {
            navigation.navigate('ErrorReportScreen');
        }}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.label, styles.redText]}>Report an Issue</Text>
          </View>
        </TouchableOpacity> */}

        {/* Forget Glasses */}
        <TouchableOpacity
          style={styles.settingItem}
          disabled={!status.core_info.puck_connected || status.core_info.default_wearable === ''}
          onPress={confirmForgetGlasses}
        >
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                styles.redText,
                (!status.core_info.puck_connected || status.core_info.default_wearable === '') &&
                  styles.disabledItem,
              ]}
            >
              Forget Glasses
            </Text>
          </View>
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity style={styles.settingItem} onPress={confirmSignOut}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.label, styles.redText]}>Sign Out</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>


      {/* Your app's bottom navigation bar */}
      <NavigationBar toggleTheme={toggleTheme} isDarkTheme={isDarkTheme} />
    </View>
  );
};

export default SettingsPage;

const styles = StyleSheet.create({
  scrollViewContainer: {
    marginBottom: 0,
  },
  container: {
    flex: 1,
    padding: -1,
    margin: -1,
    paddingLeft: 20,
    paddingRight: 20,
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: 0,
    marginBottom: 10,
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  redText: {
    color: '#FF0F0F',
  },
  darkText: {
    color: 'black',
  },
  lightText: {
    color: 'white',
  },
  darkSubtext: {
    color: '#666666',
  },
  lightSubtext: {
    color: '#999999',
  },
  darkIcon: {
    color: '#333333',
  },
  lightIcon: {
    color: '#666666',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomColor: '#333',
    borderBottomWidth: 1,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  label: {
    fontSize: 16,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 12,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  disabledItem: {
    opacity: 0.4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  thumbTouchSize: {
    width: 40,
    height: 40,
  },
  trackStyle: {
    height: 5,
  },
  thumbStyle: {
    height: 20,
    width: 20,
  },
  minimumTrackTintColor: {
    color: '#2196F3',
  },
  maximumTrackTintColorDark: {
    color: '#666666',
  },
  maximumTrackTintColorLight: {
    color: '#D1D1D6',
  },
  thumbTintColor: {
    color: '#FFFFFF',
  },
});
