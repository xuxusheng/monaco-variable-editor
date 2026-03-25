import { memo } from "react";
import { Search, X } from "lucide-react";

interface SearchOverlayProps {
  searchQuery: string;
  onQueryChange: (q: string) => void;
  results: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchOverlay = memo(function SearchOverlay({
  searchQuery,
  onQueryChange,
  results,
  onSelect,
  onClose,
  inputRef,
}: SearchOverlayProps) {
  return (
    <div className="absolute top-2 left-2 right-2 z-50 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-80 md:max-w-[calc(100%-1rem)] bg-card border border-border rounded-lg shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="搜索节点名称..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          autoFocus
        />
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      {searchQuery.trim() && (
        <div className="max-h-60 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">无匹配结果</div>
          ) : (
            results.map((node) => (
              <button
                key={node.id}
                onClick={() => onSelect(node.id)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate"
              >
                {node.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
