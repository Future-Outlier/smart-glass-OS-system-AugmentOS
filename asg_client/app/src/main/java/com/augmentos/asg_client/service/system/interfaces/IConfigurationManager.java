package com.augmentos.asg_client.service.system.interfaces;

/**
 * Interface for configuration management operations.
 * Follows Single Responsibility Principle by handling only configuration concerns.
 */
public interface IConfigurationManager {
    
    /**
     * Save core token to persistent storage
     * @param coreToken The core token to save
     * @return true if saved successfully, false otherwise
     */
    boolean saveCoreToken(String coreToken);
    
    /**
     * Retrieve core token from persistent storage
     * @return The saved core token, or null if not found
     */
    String getCoreToken();
    
    /**
     * Clear core token from persistent storage
     * @return true if cleared successfully, false otherwise
     */
    boolean clearCoreToken();
    
    /**
     * Check if core token exists
     * @return true if core token exists, false otherwise
     */
    boolean hasCoreToken();
    
    /**
     * Save any configuration value
     * @param key Configuration key
     * @param value Configuration value
     * @return true if saved successfully, false otherwise
     */
    boolean saveConfiguration(String key, String value);
    
    /**
     * Retrieve configuration value
     * @param key Configuration key
     * @param defaultValue Default value if key not found
     * @return Configuration value or default value
     */
    String getConfiguration(String key, String defaultValue);
    
    /**
     * Clear configuration value
     * @param key Configuration key
     * @return true if cleared successfully, false otherwise
     */
    boolean clearConfiguration(String key);
} 