import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import {
  Loader2,
  Search,
  X,
} from "lucide-react";

export type SearchResult = {
  path: string;
  score?: number;
};

type SearchResponse = {
  results?: SearchResult[];
};

type SearchBarProps = {
  onResults: (
    results: SearchResult[],
  ) => void;
  onSearchChange: (
    searching: boolean,
  ) => void;
  onQueryChange?: (
    query: string,
  ) => void;
};

const AI_API_URL =
  "http://127.0.0.1:8000";

export function SearchBar({
  onResults,
  onSearchChange,
  onQueryChange,
}: SearchBarProps) {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const debounceRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const abortRef =
    useRef<AbortController | null>(
      null,
    );

  const clearSearch = (): void => {
    if (debounceRef.current) {
      clearTimeout(
        debounceRef.current,
      );
      debounceRef.current = null;
    }

    abortRef.current?.abort();
    abortRef.current = null;

    setQuery("");
    onQueryChange?.("");
    setLoading(false);
    onResults([]);
    onSearchChange(false);
  };

  const runSearch = async (
    rawQuery: string,
  ): Promise<void> => {
    const trimmed =
      rawQuery.trim();

    onQueryChange?.(trimmed);

    if (!trimmed) {
      onResults([]);
      onSearchChange(false);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();

    const controller =
      new AbortController();

    abortRef.current =
      controller;

    setLoading(true);
    onSearchChange(true);

    try {
      const response =
        await fetch(
          `${AI_API_URL}/api/search`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              query: trimmed,
              /*
               * Request enough candidates for the
               * App-side Smart Album semantic filter.
               */
              limit: 50,
            }),
            signal:
              controller.signal,
          },
        );

      if (!response.ok) {
        let message =
          `Search failed (${response.status}).`;

        try {
          const body: unknown =
            await response.json();

          if (
            body &&
            typeof body ===
              "object" &&
            typeof (
              body as Record<
                string,
                unknown
              >
            ).detail ===
              "string"
          ) {
            message =
              String(
                (
                  body as Record<
                    string,
                    unknown
                  >
                ).detail,
              );
          }
        } catch {
          // Keep fallback.
        }

        throw new Error(
          message,
        );
      }

      const data =
        (await response.json()) as SearchResponse;

      const results =
        Array.isArray(
          data.results,
        )
          ? data.results.filter(
              (
                item,
              ): item is SearchResult =>
                Boolean(
                  item &&
                  typeof item.path ===
                    "string",
                ),
            )
          : [];

      onResults(results);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name ===
          "AbortError"
      ) {
        return;
      }

      console.error(
        "[SEARCH] Failed:",
        error,
      );

      onResults([]);
    } finally {
      if (
        abortRef.current ===
        controller
      ) {
        abortRef.current = null;
      }

      if (
        !controller.signal.aborted
      ) {
        setLoading(false);
      }
    }
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    const value =
      event.target.value;

    setQuery(value);
    onQueryChange?.(value);

    if (debounceRef.current) {
      clearTimeout(
        debounceRef.current,
      );
      debounceRef.current =
        null;
    }

    if (!value.trim()) {
      abortRef.current?.abort();
      abortRef.current =
        null;

      onResults([]);
      onSearchChange(false);
      setLoading(false);
      return;
    }

    debounceRef.current =
      setTimeout(() => {
        void runSearch(
          value,
        );
      }, 350);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      if (debounceRef.current) {
        clearTimeout(
          debounceRef.current,
        );
        debounceRef.current =
          null;
      }

      void runSearch(query);
    }

    if (
      event.key === "Escape"
    ) {
      clearSearch();
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(
          debounceRef.current,
        );
      }

      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="search-bar">
      <Search
        size={18}
        className="search-icon"
      />

      <input
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search your photos..."
        aria-label="Search your photos"
      />

      {loading && (
        <Loader2
          size={17}
          className="search-loading"
        />
      )}

      {!loading &&
        query.length > 0 && (
          <button
            type="button"
            className="search-clear"
            onClick={
              clearSearch
            }
            aria-label="Clear search"
          >
            <X size={17} />
          </button>
        )}
    </div>
  );
}