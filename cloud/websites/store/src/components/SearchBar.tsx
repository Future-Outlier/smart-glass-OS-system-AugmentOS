import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  className?: string;
}

const SearchBar = forwardRef<HTMLFormElement, SearchBarProps>(
  (
    { searchQuery, onSearchChange, onSearchSubmit, onClear, className = "" },
    ref,
  ) => {
    const { theme } = useTheme();

    return (
      <form
        ref={ref}
        onSubmit={onSearchSubmit}
        className={`flex items-center space-x-3 ${className}`}
      >
        <div className="relative w-full absolute">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search
              className="h-5 w-5"
              style={{ color: "var(--text-secondary)" }}
            />
          </div>
          <input
            type="text"
            className=" theme-search-input w-full pl-10 pr-10 py-2.5 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#47478E] border"
            style={{
              backgroundColor:
                theme === "light" ? "var(--bg-secondary)" : "#141834",
              color: "var(--text-primary)",
              borderColor: "var(--border-color)",
            }}
            placeholder="Search"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onSearchChange(e.target.value)
            }
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center pr-3 hover:opacity-70 transition-opacity"
              onClick={onClear}
            >
              <X
                className="h-5 w-5"
                style={{ color: "var(--text-secondary)" }}
              />
            </button>
          )}
        </div>
      </form>
    );
  },
);

SearchBar.displayName = "SearchBar";

export default SearchBar;
