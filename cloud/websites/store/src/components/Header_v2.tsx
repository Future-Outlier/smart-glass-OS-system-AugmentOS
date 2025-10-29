import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { usePlatform } from "../hooks/usePlatform";
import { useTheme } from "../hooks/useTheme";
import { useIsDesktop, useIsMobile } from "../hooks/useMediaQuery";
import { useSearch } from "../contexts/SearchContext";
import { Button } from "./ui/button";
import { Search, User } from "lucide-react";
import SearchBar from "./SearchBar";
import { DropDown } from "./ui/dropdown";

interface HeaderProps {
  onSearch?: (e: React.FormEvent) => void;
  onSearchClear?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSearch, onSearchClear }) => {
  const { isAuthenticated, signOut, user } = useAuth();
  const { isWebView } = usePlatform();
  const { theme } = useTheme();
  const { searchQuery, setSearchQuery } = useSearch();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();
  const isStorePage = location.pathname === "/";
  const [searchMode, setsearchMode] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);
  const [selectedTab, setSelectedTab] = useState<
    "apps" | "glasses" | "support"
  >("apps");
  const [isScrolled, setIsScrolled] = useState(false);

  // Get user avatar - try multiple fields
  const getUserAvatar = () => {
    if (!user) return null;
    return (
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      user.user_metadata?.avatar ||
      null
    );
  };

  // Debug: log user data
  useEffect(() => {
    if (user) {
      console.log("User data:", user);
      console.log("User metadata:", user.user_metadata);
      console.log("Avatar URL:", getUserAvatar());
    }
  }, [user]);

  // Handle scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close search mode when clicking outside the header
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setsearchMode(false);
        setSearchQuery(""); // Clear search query when closing
        if (onSearchClear) {
          onSearchClear(); // Call the clear handler to reset results
        }
      }
    };

    // Only add the event listener if search mode is active
    if (searchMode) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Cleanup the event listener
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchMode, onSearchClear, setSearchQuery]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Don't show header in webview
  if (isWebView) {
    return null;
  }

  return (
    <header
      className="hidden lg:block sticky top-0 z-10 transition-all duration-300"
      style={{
        background:
          theme === "light"
            ? "#ffffff"
            : "linear-gradient(to bottom, #0c0d27, #030514)",
        borderBottom: isScrolled
          ? `1px solid var(--border-color)`
          : "1px solid transparent",
      }}
    >
      <div className=" mx-auto px py-2 pr-15 pl-15">
        {/* Two-row layout for medium screens, single row for large+ */}
        <div className="flex relative flex-col lg:flex-row lg:items-center lg:justify-between gap-4 min-h-[60px]">
          {/* Top row: Logo and Buttons */}
          <AnimatePresence>
            {searchMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="absolute left-1/2 -translate-x-1/2  w-full"
                style={{
                  borderTop: !isDesktop
                    ? `1px solid var(--border-color)`
                    : "none",
                  marginTop: !isDesktop ? "1rem" : "0",
                }}
              >
                <div className="max-w-3xl mx-auto ">
                  <SearchBar
                    ref={searchRef}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSearchSubmit={onSearch || ((e) => e.preventDefault())}
                    onClear={onSearchClear || (() => setSearchQuery(""))}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <>
            <div className="flex items-center justify-between gap-[20px] w-full lg:w-auto">
              {/* Logo and Site Name */}
              <Link
                to="/"
                className="flex items-center gap-2 sm:gap-4 select-none hover:opacity-80 transition-opacity"
              >
                <img
                  src="/mentra_logo_gr.png"
                  alt="Mentra Logo"
                  className="h-6 sm:h-7 w-auto object-contain"
                />
                <span
                  className="text-[16px] sm:text-[19px] font-light mb-[-0px]"
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    letterSpacing: "0.06em",
                    color: "var(--text-primary)",
                    fontWeight: "400",
                  }}
                >
                  Mentra Store
                </span>
              </Link>
              <AnimatePresence mode="wait">
                {!searchMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1, ease: "easeOut" }}
                    className="hidden lg:flex items-center"
                  >
                    <button
                      className={`ml-[60px] font-poppins pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px] ${
                        selectedTab === "apps" ? "border-b-2" : ""
                      }`}
                      style={
                        selectedTab === "apps"
                          ? { borderColor: "#00A814", color: "#00A814" }
                          : { color: "var(--text-primary)" }
                      }
                      onClick={() => setSelectedTab("apps")}
                    >
                      Apps
                    </button>

                    <button
                      className={`ml-[50px] font-poppins pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px] ${
                        selectedTab === "glasses" ? "border-b-2" : ""
                      }`}
                      style={
                        selectedTab === "glasses"
                          ? { borderColor: "#00A814", color: "#00A814" }
                          : { color: "var(--text-primary)" }
                      }
                      onClick={() => setSelectedTab("glasses")}
                    >
                      Glasses
                    </button>

                    <button
                      className={`ml-[50px] font-poppins pb-1 transition-all hover:text-[#00A814] cursor-pointer text-[15px] ${
                        selectedTab === "support" ? "border-b-2" : ""
                      }`}
                      style={
                        selectedTab === "support"
                          ? { borderColor: "#00A814", color: "#00A814" }
                          : { color: "var(--text-primary)" }
                      }
                      onClick={() => setSelectedTab("support")}
                    >
                      Support
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Buttons container - only visible on mobile/tablet in top row */}
              <div className="flex items-center gap-3 lg:hidden">
                {/* Get MentraOS Button - Only visible on small screens and up */}
                {/* <div className="hidden sm:block">
                <GetMentraOSButton size="small" />
              </div> */}

                {/* Authentication */}
                {isAuthenticated ? (
                  <Button
                    onClick={handleSignOut}
                    variant={theme === "light" ? "default" : "outline"}
                    className="rounded-full border-[1.5px]"
                    style={{
                      backgroundColor:
                        theme === "light" ? "#000000" : "transparent",
                      borderColor: theme === "light" ? "#000000" : "#C0C4FF",
                      color: theme === "light" ? "#ffffff" : "#C0C4FF",
                    }}
                  >
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigate("/login")}
                    variant={theme === "light" ? "default" : "outline"}
                    className="rounded-full border-[1.5px]"
                    style={{
                      backgroundColor:
                        theme === "light" ? "#000000" : "transparent",
                      borderColor: theme === "light" ? "#000000" : "#C0C4FF",
                      color: theme === "light" ? "#ffffff" : "#C0C4FF",
                    }}
                  >
                    Sign In
                  </Button>
                )}
              </div>
            </div>

            {/* Search bar - second row on medium, center on large+ */}
            {!isMobile && isStorePage && onSearch && (
              <div
                className="w-full lg:flex-1 lg:max-w-md lg:mx-auto pt-4 lg:pt-0"
                style={{
                  borderTop: !isDesktop
                    ? `1px solid var(--border-color)`
                    : "none",
                  marginTop: !isDesktop ? "1rem" : "0",
                }}
              >
                {/* <SearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearchSubmit={onSearch}
                onClear={onSearchClear || (() => setSearchQuery(''))}
              /> */}
              </div>
            )}

            {/* Buttons for large screens - in the same row */}
            <div className="hidden lg:flex items-center gap-4">
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
                    className="flex justify-center items-center rounded-full w-[36px] h-[36px] hover:bg-[#F2F2F2] cursor-pointer"
                    onClick={() => {
                      setsearchMode(true);
                    }}
                  >
                    <Search size={"20px"} color="#999999" />
                  </button>
                  <DropDown
                    trigger={
                      <button className="flex justify-center items-center rounded-full bg-[#F2F2F2] w-[36px] h-[36px] overflow-hidden">
                        {getUserAvatar() ? (
                          <img
                            src={getUserAvatar()!}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User color="#999999" />
                        )}
                      </button>
                    }
                    contentClassName="mt-2 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-0 min-w-[280px]"
                  >
                    <div className="flex flex-col">
                      {/* User Info Section */}
                      <div className="flex flex-col items-center py-6 px-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="w-20 h-20 rounded-full bg-[#F2F2F2] flex items-center justify-center overflow-hidden mb-3">
                          {getUserAvatar() ? (
                            <img
                              src={getUserAvatar()!}
                              alt="Profile"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={40} color="#999999" />
                          )}
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-base text-gray-900 dark:text-white">
                            {user?.user_metadata?.full_name ||
                              user?.email?.split("@")[0] ||
                              "User"}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {user?.email || "No email"}
                          </p>
                        </div>
                      </div>

                      {/* Sign Out Button */}
                      <div className="p-2">
                        <button
                          onClick={handleSignOut}
                          className="w-full text-center px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-600 font-medium"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </DropDown>
                </div>
              ) : (
                <Button
                  onClick={() => navigate("/login")}
                  variant={theme === "light" ? "default" : "outline"}
                  className="rounded-full border-[1.5px]"
                  style={{
                    backgroundColor:
                      theme === "light" ? "#000000" : "transparent",
                    borderColor: theme === "light" ? "#000000" : "#C0C4FF",
                    color: theme === "light" ? "#ffffff" : "#C0C4FF",
                  }}
                >
                  Sign In
                </Button>
              )}
            </div>
          </>
        </div>
      </div>
    </header>
  );
};

export default Header;
