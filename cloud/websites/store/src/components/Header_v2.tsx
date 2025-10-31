import {useState, useRef, useEffect} from "react"
import {Link, useNavigate, useLocation} from "react-router-dom"
import {motion, AnimatePresence} from "framer-motion"
import {useAuth} from "../hooks/useAuth"
import {usePlatform} from "../hooks/usePlatform"
import {useTheme} from "../hooks/useTheme"
import {useSearch} from "../contexts/SearchContext"
import {Button} from "./ui/button"
import {Search, User} from "lucide-react"
import SearchBar from "./SearchBar"
import {DropDown} from "./ui/dropdown"

interface HeaderProps {
  onSearch?: (e: React.FormEvent) => void
  onSearchClear?: () => void
}

const Header: React.FC<HeaderProps> = ({onSearch, onSearchClear}) => {
  const {isAuthenticated, signOut, user} = useAuth()
  const {isWebView} = usePlatform()
  const {theme} = useTheme()
  const {searchQuery, setSearchQuery} = useSearch()
  const navigate = useNavigate()
  const location = useLocation()
  const isStorePage = location.pathname === "/"
  const [searchMode, setsearchMode] = useState(false)
  const searchRef = useRef<HTMLFormElement>(null)

  // Check URL params for search trigger
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get("search") === "true") {
      setsearchMode(true)
      // Clean up URL
      searchParams.delete("search")
      const newSearch = searchParams.toString()
      navigate(location.pathname + (newSearch ? `?${newSearch}` : ""), {
        replace: true,
      })
    }
  }, [location.search, location.pathname, navigate])
  const [selectedTab, setSelectedTab] = useState<"apps" | "glasses" | "support">("apps")
  const [isScrolled, setIsScrolled] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1920)

  // Track window width for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Get user avatar - try multiple fields
  const getUserAvatar = () => {
    if (!user) return null
    return user.user_metadata?.avatar_url || user.user_metadata?.picture || user.user_metadata?.avatar || null
  }

  // Debug: log user data
  useEffect(() => {
    if (user) {
      console.log("User data:", user)
      console.log("User metadata:", user.user_metadata)
      console.log("Avatar URL:", getUserAvatar())
    }
  }, [user])

  // Handle scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Close search mode when clicking outside the header
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // Don't close if clicking on an app card or any clickable app element
      if (
        target.closest("[data-app-card]") ||
        target.closest(".cursor-pointer") ||
        target.closest("a") ||
        target.closest("button")
      ) {
        return
      }

      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setsearchMode(false)
        setSearchQuery("") // Clear search query when closing
        if (onSearchClear) {
          onSearchClear() // Call the clear handler to reset results
        }
      }
    }

    // Only add the event listener if search mode is active
    if (searchMode) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    // Cleanup the event listener
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [searchMode, onSearchClear, setSearchQuery])

  // Handle sign out
  const handleSignOut = async () => {
    await signOut()
    navigate("/")
  }

  // Don't show header in webview
  if (isWebView) {
    return null
  }

  return (
    <header
      className="sticky top-0 z-10 transition-all duration-300"
      style={{
        background: theme === "light" ? "#ffffff" : "#171717",
        borderBottom: isScrolled ? `1px solid var(--border-color)` : "1px solid transparent",
      }}>
      <div className=" mx-auto px px-4 sm:px- md:px-16 lg:px-25  ">
        {/* Two-row layout for medium screens, single row for large+ */}
        <div className="flex relative flex-row lg:flex-row lg:items-center lg:justify-between gap-4 min-h-[60px]  items-center">
          {/* Top row: Logo and Buttons */}
          <AnimatePresence>
            {searchMode && (
              <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                transition={{duration: 0.2, ease: "easeOut"}}
                className="absolute left-0 right-0 w-full px-4"
                style={{
                  zIndex: 100,
                }}>
                <div className="max-w-3xl mx-auto">
                  <SearchBar
                    ref={searchRef}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSearchSubmit={onSearch || ((e) => e.preventDefault())}
                    onClear={onSearchClear || (() => setSearchQuery(""))}
                    autoFocus={true}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <>
            <div className="flex flex-row relative lg:flex-row lg:items-center lg:justify-between gap-4 min-h-[60px] w-full">
              {/* Logo and Site Name - hide when search mode is active on small/medium screens */}
              {/* Logo - hide when search mode is active ONLY between 640px-1630px */}
              <AnimatePresence>
                {(!searchMode || windowWidth < 640 || windowWidth > 1330) && (
                  <motion.div
                    initial={{opacity: 1}}
                    exit={{opacity: 0, x: -20}}
                    transition={{duration: 0.2, ease: "easeOut"}}
                    className="flex items-center">
                    <Link
                      to="/"
                      className="flex items-center gap-2 sm:gap-4 select-none hover:opacity-80 transition-opacity">
                      <img src="/mentra_logo_gr.png" alt="Mentra Logo" className="h-6 sm:h-7 w-auto object-contain" />
                      <span
                        className="text-[16px] sm:text-[19px] font-light mb-[-0px]"
                        style={{
                          fontFamily: "Red Hat Display, sans-serif",
                          letterSpacing: "0.06em",
                          color: "var(--text-primary)",
                          fontWeight: "400",
                        }}>
                        Mentra Store
                      </span>
                    </Link>

                    {/* Navigation tabs - show on large screens (1024px+) right after logo */}
                    {!searchMode && windowWidth >= 1024 && (
                      <div className="flex items-center ml-[60px]">
                        <button
                          className={`font-redhat pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px] ${
                            selectedTab === "apps" ? "border-b-2" : ""
                          }`}
                          style={
                            selectedTab === "apps"
                              ? {borderColor: "#00A814", color: "#00A814"}
                              : {color: "var(--text-primary)"}
                          }
                          onClick={() => setSelectedTab("apps")}>
                          Apps
                        </button>

                        <button
                          className="ml-[50px] font-redhat pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px]"
                          style={{color: "var(--text-primary)"}}
                          onClick={() => window.open("https://mentraglass.com/", "_blank")}>
                          Glasses
                        </button>

                        <button
                          className="ml-[50px] font-redhat pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px]"
                          style={{color: "var(--text-primary)"}}
                          onClick={() => window.open("https://mentraglass.com/contact", "_blank")}>
                          Support
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Buttons container - only visible on mobile (below sm) in top row */}
              <div className="flex items-center gap-3 sm:hidden ml-auto">
                {/* Authentication */}
                {isAuthenticated ? (
                  <Button
                    onClick={handleSignOut}
                    variant={theme === "light" ? "default" : "outline"}
                    className="rounded-full border-[1.5px]"
                    style={{
                      backgroundColor: theme === "light" ? "#000000" : "transparent",
                      borderColor: theme === "light" ? "#000000" : "#3f3f46",
                      color: theme === "light" ? "#ffffff" : "#e4e4e7",
                    }}>
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigate("/login")}
                    variant={theme === "light" ? "default" : "outline"}
                    className="rounded-full border-[1.5px] flex items-center gap-2"
                    style={{
                      backgroundColor: theme === "light" ? "#000000" : "transparent",
                      borderColor: theme === "light" ? "#000000" : "#3f3f46",
                      color: theme === "light" ? "#ffffff" : "#e4e4e7",
                    }}>
                    <User className="w-4 h-4" />
                    Login
                  </Button>
                )}
              </div>
            </div>

            {/* Search bar - second row on medium, center on large+ */}
            {/* {!isMobile && isStorePage && onSearch && (
              <div
                className="w-full lg:flex-1 lg:max-w-md lg:mx-auto pt-4 lg:pt-0"
                style={{
                  borderTop: !isDesktop
                    ? `1px solid var(--border-color)`
                    : "none",
                  marginTop: !isDesktop ? "1rem" : "0",
                }}
              >
                <SearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearchSubmit={onSearch}
                onClear={onSearchClear || (() => setSearchQuery(''))}
              />
              </div>
            )} */}

            {/* Buttons for small screens and above - hide when search mode is active ONLY between 640px-1630px */}
            <AnimatePresence>
              {(!searchMode || windowWidth < 640 || windowWidth > 1330) && (
                <motion.div
                  initial={{opacity: 1}}
                  exit={{opacity: 0, x: 20}}
                  transition={{duration: 0.2, ease: "easeOut"}}
                  className="hidden sm:flex items-center gap-4 ml-auto">
                  {/* Get MentraOS Button */}
                  {/* <GetMentraOSButton size="small" /> */}

                  {/* Authentication */}
                  {isAuthenticated ? (
                    <div className="flex gap-[10px]">
                      {/* <Button
                  onClick={handleSignOut}
                  variant={theme === 'light' ? 'default' : 'outline'}
                  className="rounded-full border-[1.5px]"
                  style={{
                    backgroundColor: theme === 'light' ? '#000000' : 'transparent',
                    borderColor: theme === 'light' ? '#000000' : '#C0C4FF',
                    color: theme === 'light' ? '#ffffff' : '#C0C4FF'
                  }}
                >
                  Sign Out
                </Button> */}

                      <button
                        className="flex justify-center items-center rounded-full w-[36px] h-[36px] cursor-pointer transition-colors"
                        style={{
                          backgroundColor: "transparent",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = theme === "light" ? "#F2F2F2" : "#27272a")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        onClick={() => {
                          // If not on store page, redirect to it with search param
                          if (!isStorePage) {
                            navigate("/?search=true")
                          } else {
                            setsearchMode(true)
                          }
                        }}>
                        <Search
                          size={"20px"}
                          style={{
                            color: theme === "light" ? "#999999" : "#a1a1aa",
                          }}
                        />
                      </button>
                      <DropDown
                        trigger={
                          <button
                            className="flex justify-center items-center rounded-full w-[36px] h-[36px] overflow-hidden"
                            style={{
                              backgroundColor: theme === "light" ? "#F2F2F2" : "var(--bg-secondary)",
                            }}>
                            {getUserAvatar() ? (
                              <img src={getUserAvatar()!} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                              <User
                                size={20}
                                style={{
                                  color: theme === "light" ? "#999999" : "#a1a1aa",
                                }}
                              />
                            )}
                          </button>
                        }
                        contentClassName="mt-2 right-0 shadow-lg rounded-lg p-0 min-w-[280px]">
                        <div
                          className="flex flex-col rounded-lg"
                          style={{
                            backgroundColor: theme === "light" ? "#ffffff" : "var(--bg-secondary)",
                          }}>
                          {/* User Info Section */}
                          <div
                            className="flex flex-col items-center py-6 px-4 border-b"
                            style={{
                              borderColor: theme === "light" ? "#e5e7eb" : "var(--border-color)",
                            }}>
                            <div
                              className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden mb-3"
                              style={{
                                backgroundColor: theme === "light" ? "#F2F2F2" : "var(--bg-tertiary)",
                              }}>
                              {getUserAvatar() ? (
                                <img src={getUserAvatar()!} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <User
                                  size={40}
                                  style={{
                                    color: theme === "light" ? "#999999" : "#a1a1aa",
                                  }}
                                />
                              )}
                            </div>
                            <div className="text-center">
                              <p
                                className="font-medium text-base"
                                style={{
                                  color: theme === "light" ? "#111827" : "var(--text-primary)",
                                }}>
                                {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                              </p>
                              <p
                                className="text-sm mt-1"
                                style={{
                                  color: theme === "light" ? "#6b7280" : "var(--text-secondary)",
                                }}>
                                {user?.email || "No email"}
                              </p>
                            </div>
                          </div>

                          {/* Sign Out Button */}
                          <div className="p-2">
                            <button
                              onClick={handleSignOut}
                              className="w-full text-center px-4 py-2.5 rounded text-red-600 font-medium transition-colors"
                              style={{
                                backgroundColor: "transparent",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = theme === "light" ? "#f3f4f6" : "#27272a")
                              }
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                              Sign Out
                            </button>
                          </div>
                        </div>
                      </DropDown>
                    </div>
                  ) : (
                    <div className="flex gap-[10px]">
                      <button
                        className="flex justify-center items-center rounded-full w-[36px] h-[36px] cursor-pointer transition-colors"
                        style={{
                          backgroundColor: "transparent",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = theme === "light" ? "#F2F2F2" : "#27272a")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        onClick={() => {
                          // If not on store page, redirect to it with search param
                          if (!isStorePage) {
                            navigate("/?search=true")
                          } else {
                            setsearchMode(true)
                          }
                        }}>
                        <Search
                          size={"20px"}
                          style={{
                            color: theme === "light" ? "#999999" : "#a1a1aa",
                          }}
                        />
                      </button>
                      <Button
                        onClick={() => navigate("/login")}
                        variant={theme === "light" ? "default" : "outline"}
                        className="rounded-full border-[1.5px] flex items-center gap-2"
                        style={{
                          backgroundColor: theme === "light" ? "#000000" : "transparent",
                          borderColor: theme === "light" ? "#000000" : "#3f3f46",
                          color: theme === "light" ? "#ffffff" : "#e4e4e7",
                        }}>
                        <User className="w-4 h-4" />
                        Login
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        </div>
      </div>
    </header>
  )
}

export default Header
