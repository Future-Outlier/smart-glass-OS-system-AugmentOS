import { memo, useState } from "react";
import { Button } from "./ui/button";
import { AppI } from "../types";

// Tag mapping for apps
const APP_TAGS: Record<string, string[]> = {
  X: ["Social", "News", "Media"],
  Merge: ["Chat", "Social"],
  "Live Captions": ["Language", "Communication"],
  Streamer: ["Video", "Broadcast"],
  Translation: ["Language", "Communication"],
  LinkLingo: ["Language", "Learning"],
  "Mentra Notes": ["Tools"],
  Dash: ["Fitness", "Running"],
  Calendar: ["Time", "Schedule"],
  Teleprompter: ["Media", "Tools"],
  MemCards: ["Learning", "Memory"],
};

// Fallback tags for apps without specific tags
const FALLBACK_TAGS = ["App", "Utility"];

interface AppCardProps {
  app: AppI;
  theme: string;
  isAuthenticated: boolean;
  isWebView: boolean;
  installingApp: string | null;
  onInstall: (packageName: string) => void;
  onUninstall: (packageName: string) => void;
  onOpen: (packageName: string) => void;
  onCardClick: (packageName: string) => void;
  onLogin: () => void;
}

const AppCard: React.FC<AppCardProps> = memo(
  ({
    app,
    theme,
    isAuthenticated,
    isWebView,
    installingApp,
    onInstall,
    onOpen,
    onCardClick,
    onLogin,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleCardClick = () => {
      onCardClick(app.packageName);
    };

    const handleInstallClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onInstall(app.packageName);
    };

    const handleOpenClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen(app.packageName);
    };

    const handleLoginClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onLogin();
    };

    const handleImageLoad = () => {
      setImageLoaded(true);
    };

    const handleImageError = () => {
      setImageError(true);
      setImageLoaded(true);
    };

    return (
      <div
        className="p-3 sm:p-4 flex gap-2 sm:gap-3 rounded-sm relative cursor-pointer "
        onClick={handleCardClick}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        <div
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-px w-[90%] sm:w-75"
          style={{ backgroundColor: "var(--border-color)" }}
        ></div>

        {/* Image Column */}
        <div className="shrink-0 flex items-start pt-2">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16">
            {/* Placeholder that shows immediately */}
            <div
              className={`absolute inset-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center transition-opacity duration-200 ${
                imageLoaded ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse"></div>
            </div>

            {/* Actual image that loads in background */}
            <img
              src={
                imageError
                  ? "https://placehold.co/48x48/gray/white?text=App"
                  : app.logoURL
              }
              alt={`${app.name} logo`}
              className={`w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-2xl transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              decoding="async"
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          </div>
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col justify-end min-w-0">
          <div>
            <h3
              className="text-[14px] sm:text-[16px] font-medium -mb-[2px] truncate "
              style={{
                fontFamily: '"SF Pro Rounded", sans-serif',
                letterSpacing: "0.04em",
                color: "var(--text-primary)",
              }}
            >
              {app.name}
            </h3>

            {/* Tags */}
            <div className="flex gap-1 mb-1 flex-wrap items-center">
              {(APP_TAGS[app.name] || FALLBACK_TAGS).map((tag, index) => (
                <span key={tag} className="flex items-center gap-1">
                  <span
                    className="text-[11px] sm:text-[13px] font-medium -mb-[4px]"
                    style={{
                      fontFamily: '"SF Pro Rounded", sans-serif',
                      letterSpacing: "0.02em",
                    }}
                  >
                    {tag}
                  </span>
                  {index < (APP_TAGS[app.name] || FALLBACK_TAGS).length - 1 && (
                    <span
                      className="text-[12px]"
                      style={{
                        color: theme === "light" ? "#9E9E9E" : "#666666",
                      }}
                    >
                      •
                    </span>
                  )}
                </span>
              ))}
            </div>

            {app.description && (
              <p
                className="text-[11px] font-normal leading-[1.3] line-clamp-1 break-words mb-[3px]"
                style={{
                  fontFamily: '"SF Pro Rounded", sans-serif',
                  letterSpacing: "0.04em",
                  color: theme === "light" ? "#4a4a4a" : "#9A9CAC",
                  WebkitLineClamp: 1,
                  height: "1.3em",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                }}
              >
                {app.description}
              </p>
            )}
          </div>
        </div>

        {/* Button Column */}
        <div className="shrink-0 flex items-center">
          {isAuthenticated ? (
            app.isInstalled ? (
              isWebView ? (
                <Button
                  onClick={handleOpenClick}
                  disabled={installingApp === app.packageName}
                  className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit"
                  style={{
                    backgroundColor: "var(--button-bg)",
                    color: "var(--button-text)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--button-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--button-bg)")
                  }
                >
                  Open
                </Button>
              ) : (
                <Button
                  disabled={true}
                  className="text-[11px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit opacity-30 cursor-not-allowed bg-white text-black"
                  style={
                    {
                      // backgroundColor: "var(--button-bg)",
                      // color: "var(--button-text)",
                      // filter: "grayscale(100%)",
                    }
                  }
                >
                  Installed
                </Button>
              )
            ) : (
              <Button
                onClick={handleInstallClick}
                disabled={installingApp === app.packageName}
                className="text-[11px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-[70px] h-fit "
                style={{
                  backgroundColor: "var(--button-bg)",
                  color: "var(--button-text)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--button-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--button-bg)")
                }
              >
                {installingApp === app.packageName ? (
                  <>
                    <div
                      className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full mr-2 text-[11px]"
                      style={{
                        borderColor: "var(--button-text)",
                        borderTopColor: "transparent",
                      }}
                    ></div>
                    Installing
                  </>
                ) : (
                  <div className="text-[11px] font-bold">Get</div>
                )}
              </Button>
            )
          ) : (
            <Button
              onClick={handleLoginClick}
              className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit flex items-center gap-2"
              style={{
                backgroundColor: "var(--button-bg)",
                color: "var(--button-text)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--button-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--button-bg)")
              }
            >
              <div className="text-[11px] font-bold">Get</div>
              {/* <Lock className="h-4 w-4 mr-1" /> */}
            </Button>
          )}
        </div>
      </div>
    );
  },
);

AppCard.displayName = "AppCard";

export default AppCard;
