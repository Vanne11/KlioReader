import { useState, useMemo } from 'react';

export type SortOption = {
  key: string;
  label: string;
  fn: (a: any, b: any) => number;
};

export type FilterDef = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  multi?: boolean;
};

export type FilterConfig<T> = {
  searchFields: (item: T) => string[];
  filters: FilterDef[];
  sortOptions: SortOption[];
  filterFn: (item: T, activeFilters: Record<string, string[]>) => boolean;
};

export function useBookFilters<T>(items: T[], config: FilterConfig<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [activeSort, setActiveSort] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setFilter = (key: string, value: string) => {
    setActiveFilters(prev => {
      const def = config.filters.find(f => f.key === key);
      if (!value || value === 'all') {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (def?.multi) {
        const current = prev[key] || [];
        const has = current.includes(value);
        const next = has ? current.filter(v => v !== value) : [...current, value];
        if (next.length === 0) {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        }
        return { ...prev, [key]: next };
      }
      return { ...prev, [key]: [value] };
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActiveFilters({});
    setActiveSort('');
  };

  const hasActiveFilters = searchQuery.length > 0 || Object.keys(activeFilters).length > 0 || activeSort !== '';

  const filteredItems = useMemo(() => {
    let result = items;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item =>
        config.searchFields(item).some(field => field.toLowerCase().includes(q))
      );
    }

    if (Object.keys(activeFilters).length > 0) {
      result = result.filter(item => config.filterFn(item, activeFilters));
    }

    if (activeSort) {
      const sortOpt = config.sortOptions.find(s => s.key === activeSort);
      if (sortOpt) {
        result = [...result].sort(sortOpt.fn);
      }
    }

    return result;
  }, [items, searchQuery, activeFilters, activeSort, config]);

  return {
    filteredItems,
    searchQuery,
    setSearchQuery,
    activeFilters,
    setFilter,
    activeSort,
    setActiveSort,
    clearFilters,
    hasActiveFilters,
    filtersOpen,
    setFiltersOpen,
    totalCount: items.length,
  };
}
