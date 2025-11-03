import React from "react"
import {X, Info, ChevronDown} from "lucide-react"
import {Button} from "@/components/ui/button"
import GetMentraOSButton from "../components/GetMentraOSButton"
import {HardwareRequirementLevel} from "../types"
import {
  APP_TAGS,
  hardwareIcons,
  getPermissionIcon,
  getPermissionDescription,
  getAppTypeDisplay,
  AppDetailsMobileProps,
} from "./AppDetailsShared"

const AppDetailsMobile: React.FC<AppDetailsMobileProps> = ({
  app,
  theme,
  isAuthenticated,
  isWebView,
  installingApp,
  activeTab,
  setActiveTab,
  handleBackNavigation,
  handleInstall,
  handleUninstall,
  navigateToLogin,
}) => {
  return (
    <div className="px-6 py-6 pb-safe w-full">
      <div className="max-w-2xl mx-auto">
        {/* Header - Mobile Layout */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4 relative">
            {/* App Icon - Mobile */}
            <div className="flex-shrink-0">
              <img
                src={app.logoURL}
                alt={`${app.name} logo`}
                className="w-[80px] h-[80px] object-cover rounded-[20px] shadow-md"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = "https://placehold.co/80x80/gray/white?text=App"
                }}
              />
            </div>

            {/* App Info - Mobile */}
            <div className="flex-1 min-w-0 pr-8">
              {/* App Title */}
              <h1
                className="text-[24px] font-normal leading-tight mb-1"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: "var(--text-primary)",
                }}>
                {app.name}
              </h1>

              {/* Company Name */}
              <div
                className="text-[14px] mb-2"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#01875f" : "#4ade80",
                }}>
                {app.orgName || app.developerProfile?.company || "Mentra"}
              </div>

              {/* Category Tag */}
              <div
                className="flex items-center gap-2 text-[12px]"
                style={{
                  color: theme === "light" ? "#5f6368" : "#9CA3AF",
                }}>
                <span>{getAppTypeDisplay(app)}</span>
              </div>
            </div>

            {/* Mobile X Close Button */}
            <button
              onClick={handleBackNavigation}
              className="absolute top-0 right-0 transition-colors"
              style={{
                color: theme === "light" ? "#000000" : "#9CA3AF",
              }}
              aria-label="Close">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Description - Mobile Only */}
          <div className="mb-6 border-t-1">
            <div className="pt-3">Description</div>
            <p
              className="font-normal leading-[1.6] text-[13px]"
              style={{
                fontFamily: '"Red Hat Display", sans-serif',
                color: theme === "light" ? "#000000" : "#E4E4E7",
              }}>
              {app.description || "No description available."}
            </p>
          </div>

          {/* Install Button - Mobile Only - Full Width */}
          <div>
            {isAuthenticated ? (
              app.isInstalled ? (
                <Button
                  disabled={true}
                  className="w-full h-[48px] text-[15px] font-semibold rounded-[8px] mb-3 opacity-40 cursor-not-allowed"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    backgroundColor: "#2ffa7d",
                    color: "#000000",
                  }}>
                  Installed
                </Button>
              ) : (
                <Button
                  onClick={handleInstall}
                  disabled={installingApp}
                  className="w-full h-[48px] text-[15px]  rounded-[8px] mb-3 transition-all"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    backgroundColor: theme === "light" ? "#2ffa7d" : "#4ade80",
                    color: "black",
                  }}>
                  {installingApp ? "Getting…" : "Get"}
                </Button>
              )
            ) : (
              <Button
                onClick={navigateToLogin}
                className="w-full h-[48px] text-[15px] font-semibold rounded-[8px] mb-3 transition-all"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  backgroundColor: theme === "light" ? "#01875f" : "#4ade80",
                  color: "#ffffff",
                }}>
                Sign in to install
              </Button>
            )}
          </div>
        </div>

        {/* Offline Warning */}
        {app.isOnline === false && (
          <div className="mb-6">
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                backgroundColor: theme === "light" ? "#FDECEA" : "rgba(255, 255, 255, 0.05)",
                border: `1px solid ${theme === "light" ? "#F5C6CB" : "rgba(255, 255, 255, 0.1)"}`,
              }}>
              <Info
                className="h-5 w-5"
                style={{
                  color: theme === "light" ? "#B91C1C" : "#FCA5A5",
                }}
              />
              <span
                className="text-[14px]"
                style={{
                  color: theme === "light" ? "#B91C1C" : "#FCA5A5",
                }}>
                This app appears to be offline. Some actions may not work.
              </span>
            </div>
          </div>
        )}

        {/* Expandable Sections - Mobile only */}
        <div className="mb-8 space-y-4">
          {/* Permissions Section */}
          <div
            className="rounded-xl overflow-hidden border"
            style={{
              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
              borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
            }}>
            <button
              onClick={() => setActiveTab(activeTab === "permissions" ? "" : "permissions")}
              className="w-full flex items-center justify-between p-4">
              <span
                className="text-[16px] font-medium"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Permissions
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${activeTab === "permissions" ? "rotate-180" : ""}`}
                style={{
                  color: theme === "light" ? "#000000" : "#9CA3AF",
                }}
              />
            </button>
            {activeTab === "permissions" && (
              <div className="px-4 pb-4">
                <p
                  className="text-[14px] mb-4 leading-[1.6]"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    color: theme === "light" ? "#6B7280" : "#9CA3AF",
                  }}>
                  Permissions that will be requested when using this app on your phone.
                </p>
                <div className="space-y-3">
                  {app.permissions && app.permissions.length > 0 ? (
                    app.permissions.map((permission, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{
                          backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                          border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                        }}>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 flex items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
                            }}>
                            <div
                              style={{
                                color: theme === "light" ? "#000000" : "#9CA3AF",
                              }}>
                              {getPermissionIcon(permission.type || "Display")}
                            </div>
                          </div>
                          <div
                            className="text-[14px] font-medium"
                            style={{
                              fontFamily: '"Red Hat Display", sans-serif',
                              color: theme === "light" ? "#000000" : "#E4E4E7",
                            }}>
                            {permission.type || "Display"}
                          </div>
                        </div>
                        <div
                          className="text-[12px] text-right max-w-[45%]"
                          style={{
                            fontFamily: '"Red Hat Display", sans-serif',
                            color: theme === "light" ? "#6B7280" : "#9CA3AF",
                          }}>
                          {permission.description || getPermissionDescription(permission.type || "Display")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="text-center py-6 rounded-lg"
                      style={{
                        backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                      }}>
                      <div
                        className="text-[14px] font-medium"
                        style={{
                          color: theme === "light" ? "#000000" : "#9CA3AF",
                        }}>
                        No special permissions required
                      </div>
                      <div
                        className="text-[12px] mt-1"
                        style={{
                          color: theme === "light" ? "#6B7280" : "#9CA3AF",
                        }}>
                        This app runs with standard system permissions only.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Hardware Section */}
          <div
            className="rounded-xl overflow-hidden border"
            style={{
              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
              borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
            }}>
            <button
              onClick={() => setActiveTab(activeTab === "hardware" ? "" : "hardware")}
              className="w-full flex items-center justify-between p-4">
              <span
                className="text-[16px] font-medium"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Hardware
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${activeTab === "hardware" ? "rotate-180" : ""}`}
                style={{
                  color: theme === "light" ? "#000000" : "#9CA3AF",
                }}
              />
            </button>
            {activeTab === "hardware" && (
              <div className="px-4 pb-4">
                <p
                  className="text-[14px] mb-4 leading-[1.6]"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    color: theme === "light" ? "#6B7280" : "#9CA3AF",
                  }}>
                  Hardware components required or recommended for this app.
                </p>
                <div className="space-y-3">
                  {app.hardwareRequirements && app.hardwareRequirements.length > 0 ? (
                    app.hardwareRequirements.map((req, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{
                          backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                          border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                        }}>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 flex items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
                            }}>
                            <div
                              style={{
                                color: theme === "light" ? "#000000" : "#9CA3AF",
                              }}>
                              {hardwareIcons[req.type]}
                            </div>
                          </div>
                          <div>
                            <div
                              className="text-[14px] font-medium"
                              style={{
                                fontFamily: '"Red Hat Display", sans-serif',
                                color: theme === "light" ? "#000000" : "#E4E4E7",
                              }}>
                              {req.type.charAt(0) + req.type.slice(1).toLowerCase()}
                            </div>
                            {req.level && (
                              <div
                                className="text-[11px] mt-0.5"
                                style={{
                                  color:
                                    req.level === HardwareRequirementLevel.REQUIRED
                                      ? theme === "light"
                                        ? "#DC2626"
                                        : "#FCA5A5"
                                      : theme === "light"
                                        ? "#6B7280"
                                        : "#9CA3AF",
                                }}>
                                {req.level === HardwareRequirementLevel.REQUIRED ? "Required" : "Optional"}
                              </div>
                            )}
                          </div>
                        </div>
                        {req.description && (
                          <div
                            className="text-[12px] text-right max-w-[45%]"
                            style={{
                              fontFamily: '"Red Hat Display", sans-serif',
                              color: theme === "light" ? "#6B7280" : "#9CA3AF",
                            }}>
                            {req.description}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div
                      className="text-center py-6 rounded-lg"
                      style={{
                        backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                      }}>
                      <div
                        className="text-[14px] font-medium"
                        style={{
                          color: theme === "light" ? "#000000" : "#9CA3AF",
                        }}>
                        No specific hardware requirements
                      </div>
                      <div
                        className="text-[12px] mt-1"
                        style={{
                          color: theme === "light" ? "#6B7280" : "#9CA3AF",
                        }}>
                        This app works with any glasses configuration.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contact Section */}
          <div
            className="rounded-xl overflow-hidden border"
            style={{
              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
              borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
            }}>
            <button
              onClick={() => setActiveTab(activeTab === "contact" ? "" : "contact")}
              className="w-full flex items-center justify-between p-4">
              <span
                className="text-[16px] font-medium"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Contact
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${activeTab === "contact" ? "rotate-180" : ""}`}
                style={{
                  color: theme === "light" ? "#000000" : "#9CA3AF",
                }}
              />
            </button>
            {activeTab === "contact" && (
              <div className="px-4 pb-4">
                <p
                  className="text-[14px] mb-4 leading-[1.6]"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    color: theme === "light" ? "#6B7280" : "#9CA3AF",
                  }}>
                  Get in touch with the developer or learn more about this app.
                </p>
                <div className="space-y-3">
                  <div
                    className="flex justify-between items-center py-2"
                    style={{
                      borderBottom: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                    }}>
                    <span
                      className="text-[13px] font-medium"
                      style={{
                        color: theme === "light" ? "#6B7280" : "#9CA3AF",
                      }}>
                      Company
                    </span>
                    <span
                      className="text-[13px] font-normal text-right"
                      style={{
                        color: theme === "light" ? "#000000" : "#E4E4E7",
                      }}>
                      {app.orgName || app.developerProfile?.company || "Mentra"}
                    </span>
                  </div>

                  {app.developerProfile?.website && (
                    <div
                      className="flex justify-between items-center py-2"
                      style={{
                        borderBottom: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                      }}>
                      <span
                        className="text-[13px] font-medium"
                        style={{
                          color: theme === "light" ? "#6B7280" : "#9CA3AF",
                        }}>
                        Website
                      </span>
                      <a
                        href={app.developerProfile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-normal hover:underline text-right"
                        style={{
                          color: theme === "light" ? "#01875f" : "#4ade80",
                        }}>
                        {app.developerProfile.website}
                      </a>
                    </div>
                  )}

                  {app.developerProfile?.contactEmail && (
                    <div className="flex justify-between items-center py-2">
                      <span
                        className="text-[13px] font-medium"
                        style={{
                          color: theme === "light" ? "#6B7280" : "#9CA3AF",
                        }}>
                        Contact
                      </span>
                      <a
                        href={`mailto:${app.developerProfile.contactEmail}`}
                        className="text-[13px] font-normal hover:underline text-right"
                        style={{
                          color: theme === "light" ? "#01875f" : "#4ade80",
                        }}>
                        {app.developerProfile.contactEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Get MentraOS - Hide in React Native WebView */}
        {!isWebView && (
          <div className="text-center mb-8 mt-12">
            <div className="flex justify-center">
              <GetMentraOSButton size="small" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AppDetailsMobile
