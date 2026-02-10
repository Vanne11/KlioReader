import { Search, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import type { FilterDef, SortOption } from '@/hooks/useBookFilters';

type Props = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filters: FilterDef[];
  activeFilters: Record<string, string[]>;
  onFilterChange: (key: string, value: string) => void;
  sortOptions: SortOption[];
  activeSort: string;
  onSortChange: (key: string) => void;
  onClear: () => void;
  hasActive: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  filteredCount: number;
  totalCount: number;
};

export function SearchFilterBar({
  searchQuery, onSearchChange,
  filters, activeFilters, onFilterChange,
  sortOptions, activeSort, onSortChange,
  onClear, hasActive,
  filtersOpen, onToggleFilters,
  filteredCount, totalCount,
}: Props) {
  const { t } = useT();
  const showCount = hasActive && filteredCount !== totalCount;

  return (
    <div className="space-y-2">
      {/* Search row */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-10 py-2 text-sm focus:border-primary outline-none transition-colors placeholder:opacity-30"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 shrink-0 h-9 px-3 border ${filtersOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'border-white/10 opacity-60 hover:opacity-100'}`}
          onClick={onToggleFilters}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden md:inline text-xs">{t('filters.filters')}</span>
          {Object.keys(activeFilters).length > 0 && (
            <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center text-primary-foreground">
              {Object.keys(activeFilters).length}
            </span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {filters.map(filter => (
            <div key={filter.key} className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{filter.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {!filter.multi && (
                  <button
                    onClick={() => onFilterChange(filter.key, 'all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      !activeFilters[filter.key]?.length
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-white/5 border border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {t('filters.all')}
                  </button>
                )}
                {filter.options.map(opt => {
                  const isActive = activeFilters[filter.key]?.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onFilterChange(filter.key, opt.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        isActive
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-white/5 border border-white/10 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sort */}
          {sortOptions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> {t('filters.sortBy')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sortOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => onSortChange(activeSort === opt.key ? '' : opt.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      activeSort === opt.key
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-white/5 border border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer: count + clear */}
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-[10px] opacity-40">
              {showCount
                ? t('filters.showing', { count: filteredCount, total: totalCount })
                : t('filters.totalBooks', { count: totalCount })}
            </span>
            {hasActive && (
              <button onClick={onClear} className="text-[10px] text-primary hover:text-primary/80 font-bold transition-colors">
                {t('filters.clearAll')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline count when panel is closed */}
      {!filtersOpen && showCount && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] opacity-40">
            {t('filters.showing', { count: filteredCount, total: totalCount })}
          </span>
          <button onClick={onClear} className="text-[10px] text-primary hover:text-primary/80 font-bold transition-colors">
            {t('filters.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}
