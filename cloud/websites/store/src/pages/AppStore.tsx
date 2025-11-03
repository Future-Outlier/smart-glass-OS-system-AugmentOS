import {useState, useEffect, useCallback, useMemo, useRef} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"
import {X, Building, ChevronLeft, ChevronRight} from "lucide-react"
import {motion} from "framer-motion"
import {useAuth} from "../hooks/useAuth"
import {useTheme} from "../hooks/useTheme"
// import { usePlatform } from "../hooks/usePlatform"; // Deprecated: No longer used after removing Open button
import {useSearch} from "../contexts/SearchContext"
import {useIsMobile} from "../hooks/useMediaQuery"
import SearchBar from "../components/SearchBar"
import api, {AppFilterOptions} from "../api"
import {AppI} from "../types"
import Header from "../components/Header_v2"
import AppCard from "../components/AppCard"
import SkeletonAppCard from "../components/SkeletonAppCard"
import SkeletonSlider from "../components/SkeletonSlider"
import {toast} from "sonner"
import {formatCompatibilityError} from "../utils/errorHandling"
import {
  CaptionsSlide,
  CaptionsSlideMobile,
  MergeSlide,
  MergeSlideMobile,
  StreamSlide,
  XSlide,
  XSlideMobile,
} from "../components/ui/slides"

// Extend window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}

/**
 * AppStore component that displays and manages available applications
 * Supports filtering by search query and organization ID (via URL parameter)
 */
const AppStore: React.FC = () => {
  const navigate = useNavigate()
  const {isAuthenticated, supabaseToken, coreToken, isLoading: authLoading} = useAuth()
  const {theme} = useTheme()
  // const { isWebView } = usePlatform(); // Deprecated: No longer used after removing Open button
  const [searchParams, setSearchParams] = useSearchParams()

  // Get organization ID from URL query parameter
  const orgId = searchParams.get("orgId")

  const {searchQuery, setSearchQuery} = useSearch()
  const isMobile = useIsMobile()
  const [isLoading, setIsLoading] = useState(true)
  const [slidesLoaded, setSlidesLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apps, setApps] = useState<AppI[]>([])
  const [originalApps, setOriginalApps] = useState<AppI[]>([])
  const [installingApp, setInstallingApp] = useState<string | null>(null)
  const [activeOrgFilter, setActiveOrgFilter] = useState<string | null>(orgId)
  const [orgName, setOrgName] = useState<string>("")

  // Slideshow state - use mobile or desktop slides based on screen size
  const slideComponents = isMobile
    ? [CaptionsSlideMobile, MergeSlideMobile, XSlideMobile]
    : [CaptionsSlide, MergeSlide, StreamSlide, XSlide]
  const [currentSlide, setCurrentSlide] = useState(0)
  const slideIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Helper function to check if authentication tokens are ready
  const isAuthTokenReady = () => {
    if (!isAuthenticated) return true // Not authenticated, no token needed
    return !authLoading && (supabaseToken || coreToken) // Authenticated and has token
  }

  // Slideshow navigation functions
  const goToNextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slideComponents.length)
  }, [slideComponents.length])

  // Helper function to reset the slideshow timer
  const resetSlideTimer = useCallback(() => {
    if (slideIntervalRef.current) {
      clearInterval(slideIntervalRef.current)
    }
    slideIntervalRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideComponents.length)
    }, 7500000000)
  }, [slideComponents.length])

  const goToPrevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slideComponents.length) % slideComponents.length)
    resetSlideTimer()
  }, [slideComponents.length, resetSlideTimer])

  const goToSlide = useCallback(
    (index: number) => {
      setCurrentSlide(index)
      resetSlideTimer()
    },
    [resetSlideTimer],
  )

  // Set slides as loaded after a short delay to simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlidesLoaded(true)
    }, 500) // 500ms delay to show skeleton

    return () => clearTimeout(timer)
  }, [])

  // Auto-play slideshow
  useEffect(() => {
    // Start auto-play
    slideIntervalRef.current = setInterval(() => {
      goToNextSlide()
    }, 750000000) // Change slide every 15 seconds

    // Cleanup on unmount
    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current)
      }
    }
  }, [goToNextSlide])

  // Fetch apps on component mount or when org filter changes
  useEffect(() => {
    setActiveOrgFilter(orgId)

    // Only fetch apps if auth state is settled and tokens are ready
    if (isAuthTokenReady()) {
      fetchApps()
    }
  }, [isAuthenticated, supabaseToken, coreToken, authLoading, orgId]) // Re-fetch when authentication state, tokens, or org filter changes

  /**
   * Fetches available apps and installed status
   * Applies organization filter if present in URL
   */
  const fetchApps = async () => {
    try {
      setIsLoading(true)
      setError(null)

      let appList: AppI[] = []
      let installedApps: AppI[] = []

      // Get the available apps (public list for everyone)
      try {
        // If organizationId is provided, use it for filtering
        const filterOptions: AppFilterOptions = {}
        if (orgId) {
          filterOptions.organizationId = orgId
        }

        appList = await api.app.getAvailableApps(orgId ? filterOptions : undefined)
        // console.log("Fetched available apps:", pkgapps);

        // If we're filtering by organization, get the organization name from the first app
        if (orgId && appList.length > 0) {
          const firstApp = appList[0]
          if (firstApp.orgName) {
            setOrgName(firstApp.orgName)
          } else {
            // Fallback to a generic name if orgName isn't available
            setOrgName("Selected Organization")
          }
        }
      } catch {
        // console.error("Error fetching public apps:", err);
        setError("Failed to load apps. Please try again.")
        return
      }

      // If authenticated, fetch installed apps and merge with available apps
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          installedApps = await api.app.getInstalledApps()

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>()
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true)
          })

          // Update the available apps with installed status
          appList = appList.map((app) => ({
            ...app,
            isInstalled: installedMap.has(app.packageName),
          }))

          console.log("Merged apps with install status:", appList)
        } catch (err) {
          console.error("Error fetching installed apps:", err)
          // Continue with available apps, but without install status
        }
      }

      setApps(appList)
      setOriginalApps(appList)
    } catch (err) {
      console.error("Error fetching apps:", err)
      setError("Failed to load apps. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Filter apps based on search query (client-side filtering now, adjust if needed for server-side)
  const filteredApps = useMemo(() => {
    if (searchQuery.trim() === "") return apps

    const query = searchQuery.toLowerCase()
    const filtered = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query)) ||
        app.packageName.toLowerCase().includes(query), // Also match package name
    )

    // If we have a single app that was found by package search, show it regardless
    if (apps.length === 1 && apps !== originalApps) {
      return apps
    }

    return filtered
  }, [apps, originalApps, searchQuery])

  /**
   * Handles search form submission
   * Preserves organization filter when searching
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      fetchApps() // If search query is empty, reset to all apps
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Search with the organization filter if present
      const filterOptions: AppFilterOptions = {}
      if (orgId) {
        filterOptions.organizationId = orgId
      }

      const results = await api.app.searchApps(searchQuery, orgId ? filterOptions : undefined)

      // If authenticated and tokens are ready, update the search results with installed status
      if (isAuthenticated && isAuthTokenReady()) {
        try {
          // Get user's installed apps
          const installedApps = await api.app.getInstalledApps()

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>()
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true)
          })

          // Update search results with installed status
          results.forEach((app) => {
            app.isInstalled = installedMap.has(app.packageName)
          })
        } catch (err) {
          console.error("Error updating search results with install status:", err)
        }
      }

      setApps(results)
    } catch (err) {
      console.error("Error searching apps:", err)
      toast.error("Failed to search apps")
      setError("Failed to search apps. Please try again.") // Set error state for UI
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Clears the organization filter
   */
  const clearOrgFilter = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev)
      newParams.delete("orgId")
      return newParams
    })
    setActiveOrgFilter(null)
    setOrgName("")
  }

  // Handle app installation
  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!isAuthenticated) {
        navigate("/login")
        return
      }

      // Use the web API
      try {
        setInstallingApp(packageName)

        const success = await api.app.installApp(packageName)

        if (success) {
          toast.success("App installed successfully")

          // Update the app in the list to show as installed
          setApps((prevApps) =>
            prevApps.map((app) =>
              app.packageName === packageName
                ? {
                    ...app,
                    isInstalled: true,
                    installedDate: new Date().toISOString(),
                  }
                : app,
            ),
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
        setInstallingApp(null)
      }
    },
    [isAuthenticated, navigate],
  )

  // Handle app uninstallation
  const handleUninstall = useCallback(
    async (packageName: string) => {
      if (!isAuthenticated) {
        navigate("/login")
        return
      }

      try {
        console.log("Uninstalling app:", packageName)
        setInstallingApp(packageName)

        const success = await api.app.uninstallApp(packageName)

        if (success) {
          toast.success("App uninstalled successfully")

          // Update the app in the list to show as uninstalled
          setApps((prevApps) =>
            prevApps.map((app) =>
              app.packageName === packageName ? {...app, isInstalled: false, installedDate: undefined} : app,
            ),
          )
        } else {
          toast.error("Failed to uninstall app")
        }
      } catch (err) {
        console.error("Error uninstalling app:", err)
        toast.error("Failed to uninstall app")
      } finally {
        setInstallingApp(null)
      }
    },
    [isAuthenticated, navigate],
  )

  // Deprecated: No longer used after removing Open button
  // const handleOpen = useCallback(
  //   (packageName: string) => {
  //     // If we're in webview, send message to React Native to open TPA settings
  //     if (isWebView && window.ReactNativeWebView) {
  //       window.ReactNativeWebView.postMessage(
  //         JSON.stringify({
  //           type: "OPEN_APP_SETTINGS",
  //           packageName: packageName,
  //         }),
  //       );
  //     } else {
  //       // Fallback: navigate to app details page
  //       navigate(`/package/${packageName}`);
  //     }
  //   },
  //   [isWebView, navigate],
  // );

  const handleCardClick = useCallback(
    (packageName: string) => {
      // Always navigate to app details page when clicking the card
      navigate(`/package/${packageName}`)
    },
    [navigate],
  )

  const handleLogin = useCallback(() => {
    navigate("/login")
  }, [navigate])

  const handleSearchChange = useCallback(
    async (value: string) => {
      setSearchQuery(value)
      // console.log("🔍 Search input:", value);

      // Restore original apps if we had searched by package before
      if (apps !== originalApps) {
        setApps(originalApps)
      }

      if (value.trim() === "") {
        // console.log("📊 Total apps available:", originalApps.length);
        return
      }

      const query = value.toLowerCase()
      const filtered = originalApps.filter(
        (app) =>
          app.name.toLowerCase().includes(query) || (app.description && app.description.toLowerCase().includes(query)),
      )

      // console.log(`📊 Apps matching "${value}":`, filtered.length);

      // If no local matches, try searching by package name
      if (filtered.length === 0) {
        // console.log("🔎 No local matches found. Searching by package name...");
        setIsLoading(true)
        try {
          const pkgApp = await api.app.getAppByPackageName(value)

          if (pkgApp) {
            // console.log("✅ Found app by package name:", pkgApp.name, `(${pkgApp.packageName})`);
            // Check if user is authenticated to get install status
            if (isAuthenticated && isAuthTokenReady()) {
              try {
                const installedApps = await api.app.getInstalledApps()
                pkgApp.isInstalled = installedApps.some((app) => app.packageName === pkgApp.packageName)
                console.log(`📱 App install status: ${pkgApp.isInstalled ? "INSTALLED" : "NOT INSTALLED"}`)
              } catch (error) {
                console.error("⚠️ Error checking install status:", error)
                pkgApp.isInstalled = false
              }
            } else {
              pkgApp.isInstalled = false
              // console.log("🔒 User not authenticated - showing as not installed");
            }

            setApps([pkgApp])
            // Don't clear search query - let filteredApps handle it
          } else {
            // console.log("❌ No app found with package name:", value);
          }
        } catch {
          // console.error("⚠️ Error searching by package name:", error);
        } finally {
          setIsLoading(false)
        }
      }
    },
    [apps, originalApps, isAuthenticated, isAuthTokenReady],
  )

  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}>
      {/* Header */}
      <Header
        onSearch={handleSearch}
        onSearchClear={() => {
          setSearchQuery("")
          fetchApps()
        }}
      />

      {/* Main Content */}
      {/* Search bar on mobile - sticky at top - hidden on desktop (sm and above) */}
      <div
        className="sm:hidden sticky top-0 z-20 px-[24px] py-3"
        style={{
          backgroundColor: "var(--bg-primary)",
          // borderBottom: "1px solid var(--border-color)",
        }}>
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearch}
          onClear={() => {
            setSearchQuery("")
            fetchApps()
          }}
          className="w-full"
        />
      </div>

      <main className="px-[24px] sm:px-8 md:px-16 lg:px-25 pb-6 sm:pb-10 sm:pt-1">
        {/* Organization filter indicator */}
        {activeOrgFilter && (
          <div className="my-2 sm:my-4 max-w-2xl mx-auto px-4">
            <div
              className="flex items-center text-sm px-3 py-2 rounded-md"
              style={{
                backgroundColor: theme === "light" ? "#dbeafe" : "var(--bg-secondary)",
                color: theme === "light" ? "#1e40af" : "var(--text-secondary)",
                border: `1px solid ${theme === "light" ? "#93c5fd" : "var(--border-color)"}`,
              }}>
              <Building className="h-4 w-4 mr-2" />
              <span>
                Filtered by: <span className="font-medium">{orgName || "Organization"}</span>
              </span>
              <button
                onClick={clearOrgFilter}
                className="ml-auto hover:opacity-70 transition-opacity"
                style={{
                  color: theme === "light" ? "#1e40af" : "var(--text-secondary)",
                }}
                aria-label="Clear organization filter">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search result indicator */}
        {/* {searchQuery && (
          <div className="my-2 sm:my-4 max-w-2xl mx-auto px-4">
            <p className="text-gray-600 text-left sm:text-center">
              {filteredApps.length}{" "}
              {filteredApps.length === 1 ? "result" : "results"} for &quot;
              {searchQuery}&quot;{activeOrgFilter && ` in ${orgName}`}
            </p>
          </div>
        )} */}

        {/* Error message */}
        {error && !isLoading && (
          <div className="max-w-2xl mx-auto px-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p>{error}</p>
            <button className="mt-2 text-sm font-medium text-red-700 hover:text-red-600" onClick={fetchApps}>
              Try Again
            </button>
          </div>
        )}

        {/* Slideshow Section - Hidden when searching */}
        {!searchQuery && (
          <div className="">
            {!slidesLoaded ? (
              <SkeletonSlider />
            ) : (
              <div
                className="w-full relative sm:mb-8 overflow-hidden touch-pan-y mt-3"
                onTouchStart={(e) => {
                  if (!isMobile) return
                  const touch = e.touches[0]
                  const target = e.currentTarget as HTMLDivElement & {
                    startX?: number
                    startTime?: number
                  }
                  target.startX = touch.clientX
                  target.startTime = Date.now()
                }}
                onTouchEnd={(e) => {
                  if (!isMobile) return

                  const touch = e.changedTouches[0]
                  const target = e.currentTarget as HTMLDivElement & {
                    startX?: number
                    startTime?: number
                  }
                  const startX = target.startX || 0
                  const startTime = target.startTime || Date.now()
                  const diff = touch.clientX - startX
                  const timeDiff = Date.now() - startTime
                  const velocity = Math.abs(diff) / timeDiff

                  // Check if it's a swipe (fast movement) or a drag (slow movement)
                  const isSwipe = velocity > 0.5
                  const threshold = isSwipe ? 30 : 80

                  if (diff < -threshold) {
                    // Swiped left, go to next slide
                    goToNextSlide()
                  } else if (diff > threshold) {
                    // Swiped right, go to previous slide
                    goToPrevSlide()
                  }
                }}>
                {/* Slides Container - translate horizontally based on currentSlide */}
                <motion.div
                  className="flex"
                  animate={{x: `-${currentSlide * 100}%`}}
                  transition={{
                    type: "tween",
                    duration: 0.4,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}>
                  {slideComponents.map((SlideComponent, index) => (
                    <SlideComponent key={index} />
                  ))}
                </motion.div>

                {/* Previous Button - Left Side - Hidden on mobile */}
                <motion.button
                  onClick={goToPrevSlide}
                  className="hidden sm:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 rounded-full w-8 h-8 sm:w-12 sm:h-12 items-center justify-center shadow-lg z-1 transition-colors"
                  style={{
                    backgroundColor: theme === "light" ? "#ffffff1a" : "#ffffff1a",
                    color: theme === "light" ? "#000000" : "#ffffff",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = theme === "light" ? "#ffffff" : "#ffffff33")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff1a")}
                  aria-label="Previous slide"
                  whileHover={{scale: 1.1}}
                  whileTap={{scale: 0.9}}>
                  <ChevronLeft className="w-4 h-4 sm:w-6 sm:h-6" strokeWidth={2} />
                </motion.button>

                {/* Next Button - Right Side - Hidden on mobile */}
                <motion.button
                  onClick={goToNextSlide}
                  className="hidden sm:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-full w-8 h-8 sm:w-12 sm:h-12 items-center justify-center shadow-lg transition-colors"
                  style={{
                    backgroundColor: theme === "light" ? "#ffffff1a" : "#ffffff1a",
                    color: theme === "light" ? "#000000" : "#ffffff",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = theme === "light" ? "#ffffff" : "#ffffff33")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff1a")}
                  aria-label="Next slide"
                  whileHover={{scale: 1.1}}
                  whileTap={{scale: 0.9}}>
                  <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6" strokeWidth={2} />
                </motion.button>

                {/* Slide Indicators */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 ">
                  {slideComponents.map((_, index) => (
                    <motion.button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={` rounded-full h-[2px] ${
                        index === currentSlide ? "bg-white" : "bg-white/50 hover:bg-white/75"
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                      animate={{
                        width: index === currentSlide ? 32 : 8,
                      }}
                      transition={{duration: 0.3}}
                      whileHover={{scale: 1.2}}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!searchQuery && (
          <div className=" text-[20px] sm:text-[25px] mt-[24px] mb-[24px] font-semibold text-[var(--secondary-foreground)] leading-tight">
            Top Apps
          </div>
        )}

        {/* App grid with loading skeletons */}
        <div className="">
          {isLoading ? (
            <div className="mb-2 sm:mt-4 sm:mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[30px] gap-y-6 sm:gap-y-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonAppCard key={i} />
              ))}
            </div>
          ) : !error ? (
            <div className="mt-2 mb-2 sm:mt-4 sm:mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[48px] gap-y-[24px] sm:gap-y-[24px]">
              {filteredApps.map((app, index) => {
                // Calculate if this card is in the last row
                const totalApps = filteredApps.length
                const isMdBreakpoint = window.innerWidth >= 768 && window.innerWidth < 1280
                const isXlBreakpoint = window.innerWidth >= 1280

                let columns = 1 // Default for mobile
                if (isXlBreakpoint) columns = 3
                else if (isMdBreakpoint) columns = 2

                const lastRowStartIndex = Math.floor((totalApps - 1) / columns) * columns
                const isLastRow = index >= lastRowStartIndex

                return (
                  <AppCard
                    key={app.packageName}
                    app={app}
                    theme={theme}
                    isAuthenticated={isAuthenticated}
                    // isWebView={isWebView} // Deprecated: No longer needed after removing Open button
                    installingApp={installingApp}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    // onOpen={handleOpen} // Deprecated: No longer needed after removing Open button
                    onCardClick={handleCardClick}
                    onLogin={handleLogin}
                    isLastRow={isLastRow}
                  />
                )
              })}
            </div>
          ) : null}
        </div>

        {/* Empty state */}
        {!isLoading && !error && filteredApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            {searchQuery ? (
              <>
                {/* Search Icon */}
                <div
                  className="mb-6 w-20 h-20 rounded-full flex items-center justify-center"
                  style={{backgroundColor: "var(--bg-secondary)"}}>
                  <svg
                    className="w-10 h-10"
                    style={{color: "var(--text-muted)"}}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                {/* No Results Text */}
                <h3 className="text-xl sm:text-2xl font-semibold mb-2" style={{color: "var(--text-primary)"}}>
                  No apps found
                </h3>
                <p
                  className="text-base mb-6 max-w-md justify-center text-center"
                  style={{color: "var(--text-secondary)"}}>
                  We couldn&apos;t find any apps matching &quot;{searchQuery}
                  &quot;
                  {activeOrgFilter && ` in ${orgName}`}
                </p>

                {/* Clear Search Button */}
                <motion.button
                  className="px-6 py-3 font-medium rounded-xl shadow-md transition-colors"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-primary)")}
                  onClick={() => {
                    setSearchQuery("")
                    fetchApps() // Reset to all apps
                  }}
                  whileHover={{scale: 1.05}}
                  whileTap={{scale: 0.95}}>
                  Clear Search
                </motion.button>
              </>
            ) : (
              <>
                {/* Empty Icon */}
                <div
                  className="mb-6 w-20 h-20 rounded-full flex items-center justify-center"
                  style={{backgroundColor: "var(--bg-secondary)"}}>
                  <svg
                    className="w-10 h-10"
                    style={{color: "var(--text-muted)"}}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                </div>
                <p className="text-lg" style={{color: "var(--text-secondary)"}}>
                  {activeOrgFilter ? `No apps available for ${orgName}.` : "No apps available at this time."}
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default AppStore
