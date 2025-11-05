import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Building } from "lucide-react";
import { useAuth } from "@mentra/shared";
import { useTheme } from "../hooks/useTheme";
import { usePlatform } from "../hooks/usePlatform";
import { useSearch } from "../contexts/SearchContext";
import { useIsMobile } from "../hooks/useMediaQuery";
import SearchBar from "../components/SearchBar";
import api, { AppFilterOptions } from "../api";
import { AppI } from "../types";
import Header from "../components/Header";
import AppCard from "../components/AppCard";
import { toast } from "sonner";
import { formatCompatibilityError } from "../utils/errorHandling";
import AppStoreMobile from "./AppStoreMobile"
import AppStoreDesktop from "./AppStoreDesktop"

// Extend window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

/**
 * AppStore component that routes to mobile or desktop version
 * based on screen size
 */
const AppStore: React.FC = () => {
  const isMobile = useIsMobile()

  return isMobile ? <AppStoreMobile /> : <AppStoreDesktop />
}

export default AppStore
