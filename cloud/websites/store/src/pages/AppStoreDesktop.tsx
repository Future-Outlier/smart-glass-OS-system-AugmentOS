import {useState, useEffect, useCallback, useMemo, useRef} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"
import {X, Building, ChevronLeft, ChevronRight} from "lucide-react"
import {motion} from "framer-motion"
import {useAuth} from "@mentra/shared"
import {useTheme} from "../hooks/useTheme"
import {useSearch} from "../contexts/SearchContext"
import api, {AppFilterOptions} from "../api"
import {AppI} from "../types"
import Header from "../components/Header_v2"
import AppCard from "../components/AppCard"
import SkeletonAppCard from "../components/SkeletonAppCard"
import SkeletonSlider from "../components/SkeletonSlider"
import {toast} from "sonner"
import {formatCompatibilityError} from "../utils/errorHandling"
import {CaptionsSlide, MergeSlide, StreamSlide, XSlide} from "../components/ui/slides"

/**
 * Desktop-optimized AppStore component
 */
const AppStoreDesktop: React.FC = () => {
  const navigate = useNavigate()
  const {isAuthenticated, supabaseToken, coreToken, isLoading: authLoading} = useAuth()
  const {theme} = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()

  // Get organization ID from URL query parameter
  const orgId = searchParams.get("orgId")

  const {searchQuery, setSearchQuery} = useSearch()
  const [isLoading, setIsLoading] = useState(true)
  const [slidesLoaded, setSlidesLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apps, setApps] = useState<AppI[]>([])
  const [originalApps, setOriginalApps] = useState<AppI[]>([])
  const [installingApp, setInstallingApp] = useState<string | null>(null)
  const [activeOrgFilter, setActiveOrgFilter] = useState<string | null>(orgId)
  const [orgName, setOrgName] = useState<string>("")

  // Slideshow state - desktop slides only
  const slideComponents = [CaptionsSlide, MergeSlide, StreamSlide, XSlide]
  const [currentSlide, setCurrentSlide] = useState(0)
  const slideIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Helper function to check if authentication tokens are ready
  const isAuthTokenReady = () => {
    if (!isAuthenticated) return true
    return !authLoading && (supabaseToken || coreToken)
  }

  // Slideshow navigation functions
  const goToNextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slideComponents.length)
  }, [slideComponents.length])

  const goToPrevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slideComponents.length) % slideComponents.length)
  }, [slideComponents.length])

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index)
  }, [])

  // Set slides as loaded after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlidesLoaded(true)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  // Auto-play slideshow - advance every 8 seconds
  useEffect(() => {
    slideIntervalRef.current = setInterval(() => {
      goToNextSlide()
    }, 8000)

    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current)
      }
    }
  }, [goToNextSlide])

  // Fetch apps on component mount or when org filter changes
  useEffect(() => {
    setActiveOrgFilter(orgId)

    if (isAuthTokenReady()) {
      fetchApps()
    }
  }, [isAuthenticated, supabaseToken, coreToken, authLoading, orgId])

  /**
   * Fetches available apps and installed status
   */
  const fetchApps = async () => {
    try {
      setIsLoading(true)
      setError(null)

      let appList: AppI[] = []
      let installedApps: AppI[] = []

      try {
        const filterOptions: AppFilterOptions = {}
        if (orgId) {
          filterOptions.organizationId = orgId
        }

        appList = await api.app.getAvailableApps(orgId ? filterOptions : undefined)

        if (orgId && appList.length > 0) {
          const firstApp = appList[0]
          if (firstApp.orgName) {
            setOrgName(firstApp.orgName)
          } else {
            setOrgName("Selected Organization")
          }
        }
      } catch {
        setError("Failed to load apps. Please try again.")
        return
      }

      if (isAuthenticated) {
        try {
          installedApps = await api.app.getInstalledApps()

          const installedMap = new Map<string, boolean>()
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true)
          })

          appList = appList.map((app) => ({
            ...app,
            isInstalled: installedMap.has(app.packageName),
          }))

          console.log("Merged apps with install status:", appList)
        } catch (err) {
          console.error("Error fetching installed apps:", err)
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

  // Filter apps based on search query
  const filteredApps = useMemo(() => {
    if (searchQuery.trim() === "") return apps

    const query = searchQuery.toLowerCase()
    const filtered = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query)) ||
        app.packageName.toLowerCase().includes(query),
    )

    if (apps.length === 1 && apps !== originalApps) {
      return apps
    }

    return filtered
  }, [apps, originalApps, searchQuery])

  /**
   * Handles search form submission
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      fetchApps()
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const filterOptions: AppFilterOptions = {}
      if (orgId) {
        filterOptions.organizationId = orgId
      }

      const results = await api.app.searchApps(searchQuery, orgId ? filterOptions : undefined)

      if (isAuthenticated && isAuthTokenReady()) {
        try {
          const installedApps = await api.app.getInstalledApps()

          const installedMap = new Map<string, boolean>()
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true)
          })

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
      setError("Failed to search apps. Please try again.")
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

      try {
        setInstallingApp(packageName)

        const success = await api.app.installApp(packageName)

        if (success) {
          toast.success("App installed successfully")

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

        const compatibilityError = formatCompatibilityError(err)
        if (compatibilityError) {
          toast.error(compatibilityError, {
            duration: 6000,
          })
        } else {
          const errorMessage =
            (err as {response?: {data?: {message?: string}}})?.response?.data?.message || "Failed to install app"
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

  const handleCardClick = useCallback(
    (packageName: string) => {
      navigate(`/package/${packageName}`)
    },
    [navigate],
  )

  const handleLogin = useCallback(() => {
    navigate("/login")
  }, [navigate])

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

      <main className="px-8 md:px-16 lg:px-25 pb-10 pt-1">
        {/* Organization filter indicator */}
        {activeOrgFilter && (
          <div className="my-4 max-w-2xl mx-auto px-4">
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
              <div className="w-full relative mb-8 overflow-hidden">
                {/* Slides Container */}
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

                {/* Previous Button - Left Side */}
                <motion.button
                  onClick={goToPrevSlide}
                  className="flex absolute left-4 top-1/2 -translate-y-1/2 rounded-full w-12 h-12 items-center justify-center shadow-lg z-1 transition-colors"
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
                  <ChevronLeft className="w-6 h-6" strokeWidth={2} />
                </motion.button>

                {/* Next Button - Right Side */}
                <motion.button
                  onClick={goToNextSlide}
                  className="flex absolute right-4 top-1/2 -translate-y-1/2 rounded-full w-12 h-12 items-center justify-center shadow-lg transition-colors"
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
                  <ChevronRight className="w-6 h-6" strokeWidth={2} />
                </motion.button>

                {/* Slide Indicators */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-1">
                  {slideComponents.map((_, index) => (
                    <motion.button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`rounded-full h-[2px] ${
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
          <div className="text-[25px] mt-[24px] mb-[24px] font-semibold text-[var(--secondary-foreground)] leading-tight">
            Top Apps
          </div>
        )}

        {/* App grid with loading skeletons */}
        <div className="">
          {isLoading ? (
            <div className="mt-4 mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[30px] gap-y-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonAppCard key={i} />
              ))}
            </div>
          ) : !error ? (
            <div className="mt-4 mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[48px] gap-y-[24px]">
              {filteredApps.map((app, index) => {
                // Calculate if this card is in the last row
                const totalApps = filteredApps.length
                const isMdBreakpoint = window.innerWidth >= 768 && window.innerWidth < 1280
                const isXlBreakpoint = window.innerWidth >= 1280

                let columns = 1
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
                    installingApp={installingApp}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
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

                <h3 className="text-2xl font-semibold mb-2 text-center" style={{color: "var(--text-primary)"}}>
                  No apps found
                </h3>
                <p className="text-base mb-6 max-w-md text-center" style={{color: "var(--text-secondary)"}}>
                  We couldn&apos;t find any apps matching &quot;{searchQuery}&quot;
                  {activeOrgFilter && ` in ${orgName}`}
                </p>

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
                    fetchApps()
                  }}
                  whileHover={{scale: 1.05}}
                  whileTap={{scale: 0.95}}>
                  Clear Search
                </motion.button>
              </>
            ) : (
              <>
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

export default AppStoreDesktop
