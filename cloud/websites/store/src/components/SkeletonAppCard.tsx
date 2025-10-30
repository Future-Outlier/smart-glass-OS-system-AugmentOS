import Skeleton from "@mui/material/Skeleton";
import { useTheme } from "../hooks/useTheme";

const SkeletonAppCard = () => {
  const { theme } = useTheme();

  return (
    <div
      className="p-4 rounded-2xl"
      style={{
        backgroundColor:
          theme === "light" ? "#ffffff" : "rgba(255, 255, 255, 0.05)",
        border: `1px solid ${theme === "light" ? "#E5E7EB" : "rgba(255, 255, 255, 0.1)"}`,
      }}
    >
      <div className="flex items-center gap-4">
        {/* App Icon Skeleton */}
        <Skeleton
          variant="rounded"
          width={64}
          height={64}
          sx={{
            bgcolor:
              theme === "light"
                ? "rgba(0, 0, 0, 0.11)"
                : "rgba(255, 255, 255, 0.11)",
            borderRadius: "16px",
          }}
        />

        {/* App Info Skeleton */}
        <div className="flex-1 min-w-0">
          {/* App Name */}
          <Skeleton
            variant="text"
            width="60%"
            height={24}
            sx={{
              bgcolor:
                theme === "light"
                  ? "rgba(0, 0, 0, 0.11)"
                  : "rgba(255, 255, 255, 0.11)",
              mb: 0.5,
            }}
          />

          {/* Tags */}
          <div className="flex gap-2 mb-2">
            <Skeleton
              variant="rounded"
              width={60}
              height={20}
              sx={{
                bgcolor:
                  theme === "light"
                    ? "rgba(0, 0, 0, 0.11)"
                    : "rgba(255, 255, 255, 0.11)",
                borderRadius: "12px",
              }}
            />
            <Skeleton
              variant="rounded"
              width={50}
              height={20}
              sx={{
                bgcolor:
                  theme === "light"
                    ? "rgba(0, 0, 0, 0.11)"
                    : "rgba(255, 255, 255, 0.11)",
                borderRadius: "12px",
              }}
            />
          </div>

          {/* Description */}
          <Skeleton
            variant="text"
            width="90%"
            height={18}
            sx={{
              bgcolor:
                theme === "light"
                  ? "rgba(0, 0, 0, 0.11)"
                  : "rgba(255, 255, 255, 0.11)",
            }}
          />
        </div>

        {/* Install Button Skeleton */}
        <Skeleton
          variant="rounded"
          width={80}
          height={36}
          sx={{
            bgcolor:
              theme === "light"
                ? "rgba(0, 0, 0, 0.11)"
                : "rgba(255, 255, 255, 0.11)",
            borderRadius: "8px",
          }}
        />
      </div>
    </div>
  );
};

export default SkeletonAppCard;
