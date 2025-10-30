/* eslint-disable @typescript-eslint/no-unused-vars */
import {useState, useEffect} from "react"
import {useParams, useNavigate, useLocation} from "react-router-dom"
import {
  X,
  Calendar,
  Info,
  Mic,
  Camera,
  MapPin,
  Shield,
  Cpu,
  Speaker,
  Wifi,
  RotateCw,
  CircleDot,
  Lightbulb,
  Share2,
  ChevronDown,
} from "lucide-react"
import {useAuth} from "../hooks/useAuth"
import {useTheme} from "../hooks/useTheme"
import {useIsDesktop} from "../hooks/useMediaQuery"
import {usePlatform} from "../hooks/usePlatform"
import api from "../api"
import {AppI, HardwareType, HardwareRequirementLevel} from "../types"
import {toast} from "sonner"
import {formatCompatibilityError} from "../utils/errorHandling"
import {Button} from "@/components/ui/button"
// import Header from "../components/Header";
import Header_v2 from "../components/Header_v2"
import GetMentraOSButton from "../components/GetMentraOSButton"
import SkeletonAppDetails from "../components/SkeletonAppDetails"

// App tags mapping (same as AppCard)
const APP_TAGS: Record<string, string[]> = {
  "X": ["Social", "News", "Media"],
  "Merge": ["Chat", "Social"],
  "Live Captions": ["Language", "Communication"],
  "Streamer": ["Video", "Broadcast"],
  "Translation": ["Language", "Communication"],
  "LinkLingo": ["Language", "Learning"],
  "Mentra Notes": ["Tools"],
  "Dash": ["Fitness", "Running"],
  "Calendar": ["Time", "Schedule"],
  "Teleprompter": ["Media", "Tools"],
  "MemCards": ["Learning", "Memory"],
}

// Hardware icon mapping
const hardwareIcons: Record<HardwareType, React.ReactNode> = {
  [HardwareType.CAMERA]: <Camera className="h-4 w-4" />,
  [HardwareType.DISPLAY]: <Cpu className="h-4 w-4" />,
  [HardwareType.MICROPHONE]: <Mic className="h-4 w-4" />,
  [HardwareType.SPEAKER]: <Speaker className="h-4 w-4" />,
  [HardwareType.IMU]: <RotateCw className="h-4 w-4" />,
  [HardwareType.BUTTON]: <CircleDot className="h-4 w-4" />,
  [HardwareType.LIGHT]: <Lightbulb className="h-4 w-4" />,
  [HardwareType.WIFI]: <Wifi className="h-4 w-4" />,
}

// Extend window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}

const AppDetails: React.FC = () => {
  const {packageName} = useParams<{packageName: string}>()
  const navigate = useNavigate()
  const location = useLocation()
  const {isAuthenticated} = useAuth()
  const {theme} = useTheme()
  const isDesktop = useIsDesktop()
  const {isWebView} = usePlatform()
  const [activeTab, setActiveTab] = useState<"description" | "permissions" | "hardware" | "contact" | "">("description")

  // Smart navigation function
  const handleBackNavigation = () => {
    // Check if we have history to go back to
    const canGoBack = window.history.length > 1

    // Check if the referrer is from the same domain
    const referrer = document.referrer
    const currentDomain = window.location.hostname

    if (canGoBack && referrer) {
      try {
        const referrerUrl = new URL(referrer)
        // If the referrer is from the same domain, go back
        if (referrerUrl.hostname === currentDomain) {
          navigate(-1)
          return
        }
      } catch (e) {
        // If parsing fails, fall through to navigate home
      }
    }

    // Otherwise, navigate to the homepage
    navigate("/")
  }

  const [app, setApp] = useState<AppI | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installingApp, setInstallingApp] = useState<boolean>(false)

  // Fetch app details on component mount
  useEffect(() => {
    if (packageName) {
      fetchAppDetails(packageName)
    }
  }, [packageName, isAuthenticated])

  /**
   * Navigates to the app store filtered by the given organization ID
   * @param orgId Organization ID to filter by
   */
  const navigateToOrgApps = (orgId: string) => {
    navigate(`/?orgId=${orgId}`)
  }

  // Get icon for permission type
  const getPermissionIcon = (type: string) => {
    const normalizedType = type.toLowerCase()
    if (normalizedType.includes("microphone") || normalizedType.includes("audio")) {
      return <Mic className="h-5 w-4" />
    }
    if (normalizedType.includes("camera") || normalizedType.includes("photo")) {
      return <Camera className="h-4 w-4" />
    }
    if (normalizedType.includes("location") || normalizedType.includes("gps")) {
      return <MapPin className="h-4 w-4" />
    }
    if (normalizedType.includes("calendar")) {
      return <Calendar className="h-4 w-4" />
    }
    return <Shield className="h-4 w-4" />
  }

  // Get default description for permission type
  const getPermissionDescription = (type: string) => {
    const normalizedType = type.toLowerCase()
    if (normalizedType.includes("microphone") || normalizedType.includes("audio")) {
      return "For voice import and audio processing."
    }
    if (normalizedType.includes("camera") || normalizedType.includes("photo")) {
      return "For capturing photos and recording videos."
    }
    if (normalizedType.includes("location") || normalizedType.includes("gps")) {
      return "For location-based features and services."
    }
    if (normalizedType.includes("calendar")) {
      return "For accessing and managing calendar events."
    }
    return "For app functionality and features."
  }

  // Fetch app details and install status
  const fetchAppDetails = async (pkgName: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // Get app details
      const appDetails = await api.app.getAppByPackageName(pkgName)
      console.log("Raw app details from API:", appDetails)

      if (!appDetails) {
        setError("App not found")
        return
      }

      // If authenticated, check if app is installed
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          const installedApps = await api.app.getInstalledApps()

          // Check if this app is installed
          const isInstalled = installedApps.some((app) => app.packageName === pkgName)

          // Update app with installed status
          appDetails.isInstalled = isInstalled

          if (isInstalled) {
            // Find installed date from the installed apps
            const installedApp = installedApps.find((app) => app.packageName === pkgName)
            if (installedApp && installedApp.installedDate) {
              appDetails.installedDate = installedApp.installedDate
            }
          }
        } catch (err) {
          console.error("Error checking install status:", err)
          // Continue with app details, but without install status
        }
      }

      setApp(appDetails)
    } catch (err) {
      console.error("Error fetching app details:", err)
      setError("Failed to load app details. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Handle app installation
  const handleInstall = async () => {
    if (!isAuthenticated) {
      navigate("/login")
      return
    }

    if (!app) return

    // Use the web API
    try {
      setInstallingApp(true)

      const success = await api.app.installApp(app.packageName)

      if (success) {
        toast.success("App installed successfully")
        setApp((prev) =>
          prev
            ? {
                ...prev,
                isInstalled: true,
                installedDate: new Date().toISOString(),
              }
            : null,
        )
      } else {
        toast.error("Failed to install app")
      }
    } catch (err) {
      console.error("Error installing app:", err)

      // Try to get a more informative error message for compatibility issues
      const compatibilityError = formatCompatibilityError(err)
      if (compatibilityError) {
        toast.error(compatibilityError, {
          duration: 6000, // Show longer for detailed messages
        })
      } else {
        // Fallback to generic error message
        const errorMessage = (err as any)?.response?.data?.message || "Failed to install app"
        toast.error(errorMessage)
      }
    } finally {
      setInstallingApp(false)
    }
  }

  // Deprecated: No longer used after removing Open button
  // const handleOpen = (packageName: string) => {
  //   // If we're in webview, send message to React Native to open TPA settings
  //   if (isWebView && window.ReactNativeWebView) {
  //     window.ReactNativeWebView.postMessage(
  //       JSON.stringify({
  //         type: "OPEN_APP_SETTINGS",
  //         packageName: packageName,
  //       }),
  //     );
  //   } else {
  //     // Fallback: refresh the page
  //     window.location.reload();
  //   }
  // };

  // Handle app uninstallation
  const handleUninstall = async () => {
    if (!isAuthenticated || !app) return

    try {
      setInstallingApp(true)

      // First stop the app
      // const stopSuccess = await api.app.stopApp(app.packageName);
      // if (!stopSuccess) {
      //   toast.error('Failed to stop app before uninstallation');
      //   return;
      // }
      // App should be stopped automatically by the backend when uninstalling.

      // Then uninstall the app
      console.log("Uninstalling app:", app.packageName)
      const uninstallSuccess = await api.app.uninstallApp(app.packageName)

      if (uninstallSuccess) {
        toast.success("App uninstalled successfully")
        setApp((prev) => (prev ? {...prev, isInstalled: false, installedDate: undefined} : null))
      } else {
        toast.error("Failed to uninstall app")
      }
    } catch (err) {
      console.error("Error uninstalling app:", err)
      toast.error("Failed to uninstall app. Please try again.")
    } finally {
      setInstallingApp(false)
    }
  }

  // Formatted date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <>
      {/* Header - Show on all screens EXCEPT webview */}
      {!isWebView && (
        <div className="sticky top-0 z-50">
          <Header_v2 />
        </div>
      )}

      <div
        className="min-h-screen"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}>
        {/* Error state */}
        {!isLoading && error && <div className="text-red-500 p-4">{error}</div>}

        {/* Loading state - Skeleton */}
        {isLoading && <SkeletonAppDetails />}

        {/* Main content */}
        {!isLoading && !error && app && (
          <div className={"" + (isDesktop ? "min-h-screen flex justify-center" : "")}>
            {/* Desktop Close Button */}
            <button
              onClick={handleBackNavigation}
              className="hidden sm:block absolute top-6 right-6 transition-colors"
              style={{
                color: theme === "light" ? "#000000" : "#9CA3AF",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = theme === "light" ? "#333333" : "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = theme === "light" ? "#000000" : "#9CA3AF")}
              aria-label="Close">
              <X className="h-6 w-6" />
            </button>

            {/* Content wrapper with responsive padding */}
            <div className="px-6 py-6 pb-safe sm:px-12 sm:py-12 sm:pb-16 w-full">
              <div className="max-w-2xl mx-auto sm:max-w-[1200px]">
                {/* Header - Google Play Style Layout */}
                <div className="mb-8">
                  {/* Mobile Layout */}
                  <div className="sm:hidden">
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
                          <span>
                            {(() => {
                              const appType = app.appType ?? app.tpaType ?? "Foreground"
                              return appType === "standard" ? "Foreground" : appType
                            })()}
                          </span>
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
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-start gap-6 mb-6">
                    {/* Left Side - App Info (takes more space on desktop) */}
                    <div className="flex-1 min-w-0">
                      {/* App Title */}
                      <h1
                        className="text-[28px] font-normal leading-tight mb-2"
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
                        className="flex items-center gap-2 text-[12px] mb-4"
                        style={{
                          color: theme === "light" ? "#5f6368" : "#9CA3AF",
                        }}>
                        <span>
                          {(() => {
                            const appType = app.appType ?? app.tpaType ?? "Foreground"
                            return appType === "standard" ? "Foreground" : appType
                          })()}
                        </span>
                      </div>

                      {/* Info Tags Section - Horizontal on Desktop only */}
                      {APP_TAGS[app.name] && (
                        <div className="hidden sm:flex items-center gap-2 mb-4 flex-wrap">
                          {APP_TAGS[app.name].map((tag, index) => (
                            <div
                              key={index}
                              className="px-3 py-1.5 rounded-full text-[12px] font-medium"
                              style={{
                                backgroundColor: theme === "light" ? "#F3F4F6" : "rgba(255, 255, 255, 0.1)",
                                color: theme === "light" ? "#374151" : "#D1D5DB",
                                fontFamily: '"Red Hat Display", sans-serif',
                              }}>
                              {tag}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Buttons Section - Desktop only */}
                      <div className="hidden sm:flex items-center gap-3">
                        {/* Install Button */}
                        {isAuthenticated ? (
                          app.isInstalled ? (
                            // Deprecated: Open button functionality
                            // isWebView ? (
                            //   <Button
                            //     onClick={() => handleOpen(app.packageName)}
                            //     disabled={installingApp}
                            //     className="px-6 h-[36px] text-[14px] font-medium rounded-[8px] transition-all"
                            //     style={{
                            //       fontFamily: '"Red Hat Display", sans-serif',
                            //       backgroundColor: "#2ffa7d",
                            //       color: "#000000",
                            //     }}
                            //   >
                            //     Open
                            //   </Button>
                            // ) : (
                            <Button
                              disabled={true}
                              className="px-6 h-[36px] text-[14px] font-medium rounded-[8px] opacity-40 cursor-not-allowed"
                              style={{
                                fontFamily: '"Red Hat Display", sans-serif',
                                backgroundColor: "#2ffa7d",
                                color: "#000000",
                              }}>
                              Installed
                            </Button>
                          ) : (
                            // )
                            <Button
                              onClick={handleInstall}
                              disabled={installingApp}
                              className="px-6 h-[36px] text-[14px] font-medium rounded-[8px] transition-all min-w-[200px]"
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
                            onClick={() =>
                              navigate("/login", {
                                state: {returnTo: location.pathname},
                              })
                            }
                            className="px-6 h-[36px] text-[14px] font-medium rounded-[8px] transition-all"
                            style={{
                              fontFamily: '"Red Hat Display", sans-serif',
                              backgroundColor: theme === "light" ? "#2ffa7d" : "#4ade80",
                              color: "black",
                            }}>
                            Get
                          </Button>
                        )}

                        {/* Share Button */}
                        <button
                          className="flex items-center gap-2 px-4 h-[36px] rounded-[8px] border transition-colors"
                          style={{
                            borderColor: theme === "light" ? "#dadce0" : "rgba(255, 255, 255, 0.2)",
                            color: theme === "light" ? "#01875f" : "#4ade80",
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
                          <Share2 className="w-4 h-4" />
                          <span className="text-[14px] font-medium">Share</span>
                        </button>
                      </div>

                      {/* Device Compatibility Notice - Desktop only */}
                      <div
                        className="hidden sm:flex items-center gap-2 text-[12px] mt-4"
                        style={{
                          color: theme === "light" ? "#5f6368" : "#9CA3AF",
                        }}>
                        <Info className="w-4 h-4" />
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

                  {/* Description - Mobile Only */}
                  <div className="sm:hidden mb-6 border-t-1">
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
                  <div className="sm:hidden">
                    {isAuthenticated ? (
                      app.isInstalled ? (
                        // Deprecated: Open button functionality
                        // isWebView ? (
                        //   <Button
                        //     onClick={() => handleOpen(app.packageName)}
                        //     disabled={installingApp}
                        //     className="w-full h-[48px] text-[15px] font-semibold rounded-[8px] mb-3 transition-all"
                        //     style={{
                        //       fontFamily: '"Red Hat Display", sans-serif',
                        //       backgroundColor: "#2ffa7d",
                        //       color: "#000000",
                        //     }}
                        //   >
                        //     Open
                        //   </Button>
                        // ) : (
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
                        // )
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
                        onClick={() =>
                          navigate("/login", {
                            state: {returnTo: location.pathname},
                          })
                        }
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

                {/* Tab Navigation - Desktop only */}
                <div
                  className="hidden sm:block mb-8 border-b"
                  style={{
                    borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
                  }}>
                  <div className="flex gap-8">
                    <button
                      onClick={() => setActiveTab("description")}
                      className="pb-4 text-[15px] font-medium transition-all relative"
                      style={{
                        color:
                          activeTab === "description"
                            ? theme === "light"
                              ? "#000000"
                              : "#ffffff"
                            : theme === "light"
                              ? "#9CA3AF"
                              : "#6B7280",
                        fontFamily: '"Red Hat Display", sans-serif',
                      }}>
                      Description
                      {activeTab === "description" && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[2px]"
                          style={{
                            backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          }}
                        />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("permissions")}
                      className="pb-4 text-[15px] font-medium transition-all relative"
                      style={{
                        color:
                          activeTab === "permissions"
                            ? theme === "light"
                              ? "#000000"
                              : "#ffffff"
                            : theme === "light"
                              ? "#9CA3AF"
                              : "#6B7280",
                        fontFamily: '"Red Hat Display", sans-serif',
                      }}>
                      Permissions
                      {activeTab === "permissions" && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[2px]"
                          style={{
                            backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          }}
                        />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("hardware")}
                      className="pb-4 text-[15px] font-medium transition-all relative"
                      style={{
                        color:
                          activeTab === "hardware"
                            ? theme === "light"
                              ? "#000000"
                              : "#ffffff"
                            : theme === "light"
                              ? "#9CA3AF"
                              : "#6B7280",
                        fontFamily: '"Red Hat Display", sans-serif',
                      }}>
                      Hardware
                      {activeTab === "hardware" && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[2px]"
                          style={{
                            backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          }}
                        />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("contact")}
                      className="pb-4 text-[15px] font-medium transition-all relative"
                      style={{
                        color:
                          activeTab === "contact"
                            ? theme === "light"
                              ? "#000000"
                              : "#ffffff"
                            : theme === "light"
                              ? "#9CA3AF"
                              : "#6B7280",
                        fontFamily: '"Red Hat Display", sans-serif',
                      }}>
                      Contact
                      {activeTab === "contact" && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[2px]"
                          style={{
                            backgroundColor: theme === "light" ? "#000000" : "#ffffff",
                          }}
                        />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Sections - Mobile only */}
                <div className="sm:hidden mb-8 space-y-4">
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

                {/* Tab Content - Desktop only */}
                <div className="hidden sm:block">
                  {activeTab === "description" && (
                    <div className="mb-8">
                      <p
                        className="text-[16px] font-normal leading-[1.6]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          color: theme === "light" ? "#000000" : "#E4E4E7",
                        }}>
                        {app.description || "No description available."}
                      </p>
                    </div>
                  )}

                  {/* Permissions Tab */}
                  {activeTab === "permissions" && (
                    <div className="mb-6">
                      <p
                        className="text-[16px] mb-6 leading-[1.6]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          color: theme === "light" ? "#000000" : "#9CA3AF",
                        }}>
                        Permissions that will be requested when using this app on your phone.
                      </p>
                      <div className="space-y-3">
                        {app.permissions && app.permissions.length > 0 ? (
                          app.permissions.map((permission, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 rounded-xl"
                              style={{
                                backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
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
                                  className="text-[15px] font-medium"
                                  style={{
                                    fontFamily: '"Red Hat Display", sans-serif',
                                    color: theme === "light" ? "#000000" : "#E4E4E7",
                                  }}>
                                  {permission.type || "Display"}
                                </div>
                              </div>
                              <div
                                className="text-[14px] text-right max-w-[50%]"
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
                              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
                              border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                            }}>
                            <div
                              className="text-[15px] font-medium"
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
                  )}

                  {/* Hardware Tab */}
                  {activeTab === "hardware" && (
                    <div className="mb-6">
                      <p
                        className="text-[16px] mb-6 leading-[1.6]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          color: theme === "light" ? "#000000" : "#9CA3AF",
                        }}>
                        Hardware components required or recommended for this app.
                      </p>
                      <div className="space-y-3">
                        {app.hardwareRequirements && app.hardwareRequirements.length > 0 ? (
                          app.hardwareRequirements.map((req, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 rounded-xl"
                              style={{
                                backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
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
                                <div>
                                  <div
                                    className="text-[15px] font-medium"
                                    style={{
                                      fontFamily: '"Red Hat Display", sans-serif',
                                      color: theme === "light" ? "#000000" : "#E4E4E7",
                                    }}>
                                    {req.type.charAt(0) + req.type.slice(1).toLowerCase()}
                                  </div>
                                  {req.level && (
                                    <div
                                      className="text-[12px] mt-0.5"
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
                                  className="text-[14px] text-right max-w-[50%]"
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
                            className="text-center py-8 rounded-xl"
                            style={{
                              backgroundColor: theme === "light" ? "" : "rgba(255, 255, 255, 0.05)",
                              border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
                            }}>
                            <div
                              className="text-[15px] font-medium"
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
                  )}

                  {/* Contact Tab */}
                  {activeTab === "contact" && (
                    <div className="mb-6">
                      <p
                        className="text-[16px] mb-6 leading-[1.6]"
                        style={{
                          fontFamily: '"Red Hat Display", sans-serif',
                          color: theme === "light" ? "#000000" : "#9CA3AF",
                        }}>
                        Get in touch with the developer or learn more about this app.
                      </p>
                      <div className="space-y-4">
                        <div
                          className="flex justify-between items-center py-3 border-b"
                          style={{
                            borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
                          }}>
                          <span
                            className="text-[14px] font-medium"
                            style={{
                              color: theme === "light" ? "#000000" : "#9CA3AF",
                            }}>
                            Company
                          </span>
                          <span
                            className="text-[14px] font-normal text-right"
                            style={{
                              color: theme === "light" ? "#000000" : "#E4E4E7",
                            }}>
                            {app.orgName || app.developerProfile?.company || "Mentra"}
                          </span>
                        </div>

                        {app.developerProfile?.website && (
                          <div
                            className="flex justify-between items-center py-3 border-b"
                            style={{
                              borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
                            }}>
                            <span
                              className="text-[14px] font-medium"
                              style={{
                                color: theme === "light" ? "#000000" : "#9CA3AF",
                              }}>
                              Website
                            </span>
                            <a
                              href={app.developerProfile.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[14px] font-normal hover:underline text-right"
                              style={{
                                color: theme === "light" ? "#000000" : "#E4E4E7",
                              }}>
                              {app.developerProfile.website}
                            </a>
                          </div>
                        )}

                        {app.developerProfile?.contactEmail && (
                          <div
                            className="flex justify-between items-center py-3 border-b"
                            style={{
                              borderColor: theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)",
                            }}>
                            <span
                              className="text-[14px] font-medium"
                              style={{
                                color: theme === "light" ? "#000000" : "#9CA3AF",
                              }}>
                              Contact
                            </span>
                            <a
                              href={`mailto:${app.developerProfile.contactEmail}`}
                              className="text-[14px] font-normal hover:underline text-right"
                              style={{
                                color: theme === "light" ? "#000000" : "#E4E4E7",
                              }}>
                              {app.developerProfile.contactEmail}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
          </div>
        )}
      </div>
    </>
  )
}

export default AppDetails
