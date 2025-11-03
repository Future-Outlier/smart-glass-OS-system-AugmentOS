import React from "react"
import {X, Info, Share2, Smartphone, ChevronLeft} from "lucide-react"
import {Button} from "@/components/ui/button"
import GetMentraOSButton from "../components/GetMentraOSButton"
import {HardwareRequirementLevel} from "../types"
import {
  APP_TAGS,
  hardwareIcons,
  getPermissionIcon,
  getPermissionDescription,
  getAppTypeDisplay,
  AppDetailsDesktopProps,
} from "./AppDetailsShared"

const AppDetailsDesktop: React.FC<AppDetailsDesktopProps> = ({
  app,
  theme,
  isAuthenticated,
  isWebView,
  installingApp,
  handleBackNavigation,
  handleInstall,
  navigateToLogin,
}) => {
  return (
    <div className="min-h-screen flex justify-center">
      {/* Desktop Close Button */}
      <button
        onClick={handleBackNavigation}
        className="absolute top-6 right-6 transition-colors"
        style={{
          color: theme === "light" ? "#000000" : "#9CA3AF",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = theme === "light" ? "#333333" : "#ffffff")}
        onMouseLeave={(e) => (e.currentTarget.style.color = theme === "light" ? "#000000" : "#9CA3AF")}
        aria-label="Close">
        <X className="h-6 w-6" />
      </button>

      {/* Content wrapper with responsive padding - matches Header_v2 exactly */}
      <div className="px-4 sm:px-8 md:px-16 lg:px-25 pt-[24px] pb-16 w-full">
          {/* Back Button */}
          <button
            onClick={handleBackNavigation}
            className="flex items-center justify-center w-[40px] h-[40px] rounded-full mb-[32px] transition-all hover:scale-105"
            style={{
              backgroundColor: theme === "light" ? "#F3F4F6" : "rgba(255, 255, 255, 0.1)",
              color: theme === "light" ? "#000000" : "#E4E4E7",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.15)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme === "light" ? "#F3F4F6" : "rgba(255, 255, 255, 0.1)"
            }}
            aria-label="Back to App Store">
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Header - Desktop Layout */}
          <div className="mb-8">
            <div className="flex items-start gap-6 mb-6">
              {/* Left Side - App Info (takes more space on desktop) */}
              <div className="flex-1 min-w-0">
                {/* App Title */}
                <h1
                  className="text-[40px] leading-tight mb-[32px] font-bold"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    color: "var(--text-primary)",
                  }}>
                  {app.name}
                </h1>

                {/* Company Name • App Type */}
                <div
                  className="flex items-center gap-2 text-[20px] mb-[8px]"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    color: theme === "light" ? "#000000" : "#E4E4E7",
                  }}>
                  <span>{app.orgName || app.developerProfile?.company || "Mentra"}</span>
                  <span>•</span>
                  <span>{getAppTypeDisplay(app)}</span>
                </div>

                {/* Info Tags Section - Horizontal on Desktop only */}
                {APP_TAGS[app.name] && (
                  <div className="flex items-center gap-2 mb-[32px] flex-wrap">
                    {APP_TAGS[app.name].map((tag, index) => (
                      <div
                        key={index}
                        className="px-3 py-1.5 rounded-full text-[14px] font-normal"
                        style={{
                          backgroundColor: theme === "light" ? "#F3F4F6" : "rgba(255, 255, 255, 0.1)",
                          color: theme === "light" ? "#000000" : "#D1D5DB",
                          fontFamily: '"Red Hat Display", sans-serif',
                        }}>
                        {tag}
                      </div>
                    ))}
                  </div>
                )}

                {/* Buttons Section - Desktop only */}
                <div className="flex items-center gap-3">
                  {/* Install Button */}
                  {isAuthenticated ? (
                    app.isInstalled ? (
                      <Button
                        disabled={true}
                        className="px-8 h-[44px] text-[20px] font-medium rounded-full opacity-40 cursor-not-allowed min-w-[242px]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          color: theme === "light" ? "#ffffff" : "#000000",
                        }}>
                        Installed
                      </Button>
                    ) : (
                      <Button
                        onClick={handleInstall}
                        disabled={installingApp}
                        className="px-8 h-[44px] text-[18px] font-medium rounded-full transition-all min-w-[242px]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          color: theme === "light" ? "#ffffff" : "#000000",
                        }}>
                        {installingApp ? "Getting…" : "Get"}
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={navigateToLogin}
                      className="px-8 h-[44px] text-[20px] font-medium rounded-full transition-all min-w-[242px]"
                      style={{
                        fontFamily: '"Red Hat Display", sans-serif',
                        backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                        color: theme === "light" ? "#ffffff" : "#000000",
                      }}>
                      Get
                    </Button>
                  )}

                  {/* Share Button */}
                  <button
                    className="w-[113px] flex items-center gap-2 px-5 h-[44px] rounded-full border transition-colors"
                    style={{
                      borderColor: theme === "light" ? "#dadce0" : "rgba(255, 255, 255, 0.2)",
                      color: theme === "light" ? "#000000" : "#ffffff",
                      fontFamily: '"Red Hat Display", sans-serif',
                    }}
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: app.name,
                          text: app.description || `Check out ${app.name}`,
                          url: window.location.href,
                        })
                      }
                    }}>
                    <Share2 className="w-[18px] h-[18px]" />
                    <span className="text-[18px] font-medium">Share</span>
                  </button>
                </div>

                {/* Device Compatibility Notice - Desktop only */}
                <div
                  className="flex items-center gap-2 text-[14px] mt-[32px]"
                  style={{
                    color: theme === "light" ? "#000000" : "#9CA3AF",
                    fontFamily: '"Red Hat Display", sans-serif',
                  }}>
                  <Smartphone className="w-[18px] h-[18px] text-[14px]" />
                  <span>This app is available for your device</span>
                </div>
              </div>

              {/* Right Side - App Icon (desktop only, larger) */}
              <div className="flex-shrink-0">
                <img
                  src={app.logoURL}
                  alt={`${app.name} logo`}
                  className="w-[220px] h-[220px] object-cover rounded-[60px] shadow-md"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = "https://placehold.co/140x140/gray/white?text=App"
                  }}
                />
              </div>
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

                      <div className="h-[1px] w-full bg-[var(--border)] mb-[24px] mt-[24px]"></div>


          {/* Vertical Scrollable Layout - All sections visible */}
          <div className="">
            {/* About this app Section */}
            <div className="">
              <h2
                className="text-[24px] font-semibold mb-[24px]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                About this app
              </h2>
              <p
                className="text-[20px] font-normal leading-[1.6]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#E4E4E7",
                }}>
                {app.description || "No description available."}
              </p>
            </div>

            <div className="h-[1px] w-full bg-[var(--border)] mb-[24px] mt-[24px]"></div>

            {/* Permission Section */}
            <div>
              <h2
                className="text-[24px] font-semibold mb-[24px]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Permission
              </h2>
              <p
                className="text-[20px] mb-6 leading-[1.6]"
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
                      className="flex items-center justify-between p-[24px] rounded-xl h-[74px]"
                      style={{
                        backgroundColor: theme === "light" ? "#F9FAFB" : "rgba(255, 255, 255, 0.05)",
                        border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                      }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 flex items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.1)",
                          }}>
                          <div
                            style={{
                              color: theme === "light" ? "#000000" : "#9CA3AF",
                            }}>
                            {getPermissionIcon(permission.type || "Display")}
                          </div>
                        </div>
                        <div
                          className="text-[20px] font-medium"
                          style={{
                            fontFamily: '"Red Hat Display", sans-serif',
                            color: theme === "light" ? "#000000" : "#E4E4E7",
                          }}>
                          {permission.type || "Display"}
                        </div>
                      </div>
                      <div
                        className="text-[20px] text-right max-w-[50%]"
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
                    className="text-center py-8 rounded-xl"
                    style={{
                      backgroundColor: theme === "light" ? "#F9FAFB" : "rgba(255, 255, 255, 0.05)",
                      border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                    }}>
                    <div
                      className="text-[20px] font-medium"
                      style={{
                        color: theme === "light" ? "#000000" : "#9CA3AF",
                      }}>
                      No special permissions required
                    </div>
                    <div
                      className="text-[13px] mt-2"
                      style={{
                        color: theme === "light" ? "#6B7280" : "#9CA3AF",
                      }}>
                      This app runs with standard system permissions only.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-[1px] w-full bg-[var(--border)] mb-[24px] mt-[24px]"></div>

            {/* Hardware Section */}
            <div>
              <h2
                className="text-[24px] font-semibold mb-[24px]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Hardware
              </h2>
              <p
                className="text-[15px] mb-6 leading-[1.6]"
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
                      className="flex items-center justify-between p-[24px] rounded-xl h-[74px]"
                      style={{
                        backgroundColor: theme === "light" ? "#F9FAFB" : "rgba(255, 255, 255, 0.05)",
                        border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                      }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 flex items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.1)",
                          }}>
                          <div
                            style={{
                              color: theme === "light" ? "#000000" : "#9CA3AF",
                            }}>
                            {hardwareIcons[req.type]}
                          </div>
                        </div>
                        <div
                          className="text-[20px] font-medium"
                          style={{
                            fontFamily: '"Red Hat Display", sans-serif',
                            color: theme === "light" ? "#000000" : "#E4E4E7",
                          }}>
                          {req.type.charAt(0) + req.type.slice(1).toLowerCase()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {req.level && (
                          <div
                            className="text-[20px] font-medium"
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
                        {req.description && (
                          <div
                            className="text-[14px] text-right"
                            style={{
                              fontFamily: '"Red Hat Display", sans-serif',
                              color: theme === "light" ? "#6B7280" : "#9CA3AF",
                            }}>
                            {req.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    className="text-center py-8 rounded-xl"
                    style={{
                      backgroundColor: theme === "light" ? "#F9FAFB" : "rgba(255, 255, 255, 0.05)",
                      border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                    }}>
                    <div
                      className="text-[20px] font-medium"
                      style={{
                        color: theme === "light" ? "#000000" : "#9CA3AF",
                      }}>
                      No specific hardware requirements
                    </div>
                    <div
                      className="text-[13px] mt-2"
                      style={{
                        color: theme === "light" ? "#6B7280" : "#9CA3AF",
                      }}>
                      This app works with any glasses configuration.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-[1px] w-full bg-[var(--border)] mb-[24px] mt-[24px]"></div>

            {/* Contact Section */}
            <div>
              <h2
                className="text-[24px] font-semibold mb-[24px]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#000000" : "#ffffff",
                }}>
                Contact
              </h2>
              <p
                className="text-[20px] mb-[24px] leading-[1.6]"
                style={{
                  fontFamily: '"Red Hat Display", sans-serif',
                  color: theme === "light" ? "#6B7280" : "#9CA3AF",
                }}>
                Get in touch with the developer or learn more about this app.
              </p>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3">
                  <span
                    className="text-[20px] font-medium"
                    style={{
                      color: theme === "light" ? "#6B7280" : "#9CA3AF",
                    }}>
                    Company
                  </span>
                  <span
                    className="text-[20px] font-normal text-right"
                    style={{
                      color: theme === "light" ? "#000000" : "#E4E4E7",
                    }}>
                    {app.orgName || app.developerProfile?.company || "Mentra"}
                  </span>
                </div>

                {app.developerProfile?.website && (
                  <div className="flex justify-between items-center py-3">
                    <span
                      className="text-[20px] font-medium"
                      style={{
                        color: theme === "light" ? "#6B7280" : "#9CA3AF",
                      }}>
                      Website
                    </span>
                    <a
                      href={app.developerProfile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[20px] font-normal hover:underline text-right"
                      style={{
                        color: theme === "light" ? "#0066CC" : "#4A9EFF",
                      }}>
                      {app.developerProfile.website}
                    </a>
                  </div>
                )}

                {app.developerProfile?.contactEmail && (
                  <div className="flex justify-between items-center py-3">
                    <span
                      className="text-[20px] font-medium"
                      style={{
                        color: theme === "light" ? "#6B7280" : "#9CA3AF",
                      }}>
                      Contact
                    </span>
                    <a
                      href={`mailto:${app.developerProfile.contactEmail}`}
                      className="text-[20px] font-normal hover:underline text-right"
                      style={{
                        color: theme === "light" ? "#0066CC" : "#4A9EFF",
                      }}>
                      {app.developerProfile.contactEmail}
                    </a>
                  </div>
                )}
              </div>
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

export default AppDetailsDesktop
