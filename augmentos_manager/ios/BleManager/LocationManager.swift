//
//  LocationManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/16/25.
//

import Foundation
import CoreLocation

class LocationManager: NSObject, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private var locationChangedCallback: (() -> Void)?
  private var currentLocation: CLLocation?
  private var currentCorrelationId: String?
  
  override init() {
    super.init()
    // delay setup until after login:
    // setup()
  }
  
  // porter test
  public func setup() {
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = 2 // Update when user moves 2 meters
    locationManager.allowsBackgroundLocationUpdates = false
    locationManager.pausesLocationUpdatesAutomatically = true
    
    // No longer requesting authorization here - permissions are handled by React Native
    
    // Start location updates (will only work if permission is already granted)
    locationManager.startUpdatingLocation()
  }
  
  func setLocationChangedCallback(_ callback: @escaping () -> Void) {
    self.locationChangedCallback = callback
  }
  
  // MARK: - CLLocationManagerDelegate Methods
  
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    
    // For single poll requests, we always send the update.
    // For continuous streams, we only send if it's a significant change.
    if currentCorrelationId != nil || currentLocation == nil || location.distance(from: currentLocation!) > locationManager.distanceFilter {
      currentLocation = location

      print("LocationManager: Location updated to \(location.coordinate.latitude), \(location.coordinate.longitude) with accuracy \(location.horizontalAccuracy)m")
      
      // Notify ServerComms to send the update to the cloud
      ServerComms.getInstance().sendLocationUpdate(
          lat: location.coordinate.latitude,
          lng: location.coordinate.longitude,
          accuracy: location.horizontalAccuracy,
          correlationId: self.currentCorrelationId
      )

      // A single poll is complete, so we clear the correlationId.
      if self.currentCorrelationId != nil {
          self.currentCorrelationId = nil
      }
    }
  }
  
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    print("LocationManager: Failed to get location. Error: \(error.localizedDescription)")
  }
  
  func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    switch status {
    case .authorizedWhenInUse, .authorizedAlways:
      locationManager.startUpdatingLocation()
    case .denied, .restricted:
      print("LocationManager: Location access denied or restricted")
    case .notDetermined:
      print("LocationManager: Location permission not determined yet")
    @unknown default:
      print("LocationManager: Unknown authorization status")
    }
  }
  
  // MARK: - New Methods for Intelligent Location Service

  public func setTier(tier: String) {
    print("LocationManager: Setting location tier to \(tier)")
    
    switch tier {
    case "realtime":
      locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "high":
      locationManager.desiredAccuracy = kCLLocationAccuracyBest
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "tenMeters":
      locationManager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "hundredMeters":
      locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "kilometer":
      locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "threeKilometers":
      locationManager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
      locationManager.distanceFilter = kCLDistanceFilterNone
    case "reduced":
      locationManager.desiredAccuracy = kCLLocationAccuracyReduced
      locationManager.distanceFilter = 3000 // Use a wider filter for reduced accuracy
    default:
      print("LocationManager: Unknown location tier \(tier), defaulting to reduced.")
      locationManager.desiredAccuracy = kCLLocationAccuracyReduced
      locationManager.distanceFilter = kCLDistanceFilterNone
    }
    
    // After changing settings, we must restart the location updates.
    locationManager.startUpdatingLocation()
  }

  public func requestSingleUpdate(accuracy: String, correlationId: String) {
    print("LocationManager: Requesting single location update with accuracy \(accuracy) and correlationId \(correlationId)")
    self.currentCorrelationId = correlationId

    // Map the accuracy string to a CLLocationAccuracy value
    switch accuracy {
    case "realtime", "high", "tenMeters":
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    case "hundredMeters":
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    case "kilometer":
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    case "threeKilometers":
        locationManager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
    default:
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters // Default to a reasonable accuracy
    }

    // This method is designed for a one-time, high-priority location delivery.
    locationManager.requestLocation()
  }

  // MARK: - Location Getters
  
  func getCurrentLocation() -> (latitude: Double, longitude: Double)? {
    guard let location = currentLocation else { return nil }
    return (latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
  }
  
  func getLastKnownLocation() -> (latitude: Double, longitude: Double)? {
    return getCurrentLocation()
  }
}
