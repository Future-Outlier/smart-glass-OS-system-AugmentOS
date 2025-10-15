import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
  const { isAuthenticated, signOut } = useAuth();
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

  // Close search mode when clicking outside the header
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setsearchMode(false);
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
  }, [searchMode]);

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
      className="sticky top-0 z-10"
      style={{
        background:
          theme === "light"
            ? "#ffffff"
            : "linear-gradient(to bottom, #0c0d27, #030514)",
        borderBottom: `1px solid var(--border-color)`,
      }}
    >
      <div className=" mx-auto px py-4 pr-15 pl-15">
        {/* Two-row layout for medium screens, single row for large+ */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 min-h-[60px] ">
          {/* Top row: Logo and Buttons */}
          {searchMode && (
            <div
              className="w-full pt-4 lg:pt-0 absolute"
              style={{
                borderTop: !isDesktop
                  ? `1px solid var(--border-color)`
                  : "none",
                marginTop: !isDesktop ? "1rem" : "0",
              }}
            >
              <div className="max-w-3xl mx-auto">
                <SearchBar
                  ref={searchRef}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onSearchSubmit={onSearch}
                  onClear={onSearchClear || (() => setSearchQuery(""))}
                />
              </div>
            </div>
          )}
          <>
            <div className="flex items-center justify-between gap-[20px] ">
              {/* Logo and Site Name */}
              <Link
                to="/"
                className="flex items-center gap-4 select-none hover:opacity-80 transition-opacity"
              >
                <img
                  src={
                    theme === "light" ? "/icon_black.svg" : "/icon_white.svg"
                  }
                  alt="Mentra Logo"
                  className="h-15 w-15"
                />
                <span
                  className="text-[23px] font-light mb-[-0px]"
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    letterSpacing: "0.06em",
                    color: "var(--text-primary)",
                    fontWeight: "400",
                  }}
                >
                  Glass Shop
                </span>
              </Link>

              <button
                className={`ml-[60px] font-poppins pb-1 transition-all  hover:text-[gray] cursor-pointer ${
                  selectedTab === "apps" ? "border-b-2" : ""
                }`}
                style={selectedTab === "apps" ? { borderColor: "#00A814" } : {}}
                onClick={() => setSelectedTab("apps")}
              >
                Apps
              </button>

              <button
                className={`ml-[50px] font-poppins pb-1 transition-all over:text-[gray] cursor-pointer ${
                  selectedTab === "glasses" ? "border-b-2" : ""
                }`}
                style={
                  selectedTab === "glasses" ? { borderColor: "#00A814" } : {}
                }
                onClick={() => setSelectedTab("glasses")}
              >
                Galsses
              </button>

              <button
                className={`ml-[50px] font-poppins pb-1 transition-all over:text-[gray] cursor-pointer ${
                  selectedTab === "support" ? "border-b-2" : ""
                }`}
                style={
                  selectedTab === "support" ? { borderColor: "#00A814" } : {}
                }
                onClick={() => setSelectedTab("support")}
              >
                Support
              </button>

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
                      <button className="flex justify-center items-center rounded-full bg-[#F2F2F2] w-[36px] h-[36px]">
                        <User color="#999999" />
                      </button>
                    }
                    contentClassName="mt-2 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 min-w-[200px]"
                  >
                    <div className="flex flex-col gap-2">
                      <button className="text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        Profile
                      </button>
                      <button className="text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        Settings
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-600"
                      >
                        Sign Out
                      </button>
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
