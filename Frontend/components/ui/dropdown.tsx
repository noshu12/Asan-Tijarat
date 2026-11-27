// GROUP2-AUTH-FIX 2026-11-27
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  prefix?: string; // e.g. "Category" -> button shows "Category: All"
  ariaLabel: string;
  search?: boolean; // default: options.length > 4
  align?: 'left' | 'right'; // panel side — default 'right' (Category/Price
  // sit on the right of their row). The leftmost filter (Cities) must
  // use 'left': a right-aligned panel under it slides off the left edge
  // of the screen on sm+ screens.
  buttonClassName?: string;
  panelClassName?: string; // panel width — default 'w-72' (filters). A full-width
  // button (e.g. Get Started City / Shop Type) passes 'w-full' so the panel
  // lines up exactly with the field and can never be cut off sideways.
  listMaxH?: number; // list max height in px — default 190. City (8 options)
  // needs ~300, Shop Type (10) ~370, so all options show without scrolling.
}

export function Dropdown({ options, value, onChange, prefix, ariaLabel, search, align = 'right', buttonClassName, panelClassName = 'w-72', listMaxH = 190 }: DropdownProps) {
  const showSearch = search ?? options.length > 4;
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const close = () => {
    setIsOpen(false);
    setOpenUp(false);
    setQuery('');
    setHighlighted(-1);
  };

  // Open upward when there is not enough room below the button for the
  // panel (e.g. City near the bottom of a tall form at 125% zoom) — the
  // panel would otherwise be cut off at the viewport edge.
  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const estPanelH = (showSearch ? 52 : 8) + Math.min(options.length * 36, listMaxH) + 16;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Open up only when below does not fit AND above has more room.
      setOpenUp(spaceBelow < estPanelH && spaceAbove > spaceBelow);
    }
    setIsOpen(true);
  };

  const select = (optionValue: string) => {
    onChange(optionValue);
    close();
  };

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // When the panel opens with a search box, focus it so arrows/typing
  // work from the search input right away.
  useEffect(() => {
    if (isOpen && showSearch) searchInputRef.current?.focus();
  }, [isOpen, showSearch]);

  // Keep the highlight on the selected option when the panel opens, and
  // inside the filtered list when the search query changes.
  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = filtered.findIndex((o) => o.value === value);
    setHighlighted(selectedIndex >= 0 ? selectedIndex : filtered.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, query]);

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < filtered.length) {
        select(filtered[highlighted].value);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        tabIndex={0}
        onClick={toggle}
        // No search box means the button itself is the keyboard target:
        // ArrowDown/ArrowUp move the highlight, Enter selects it.
        onKeyDown={showSearch ? undefined : handleListKeyDown}
        className={
          buttonClassName ??
          'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-asan-accent flex items-center gap-2 whitespace-nowrap'
        }
      >
        <span className="truncate max-w-36 sm:max-w-52">
          {prefix ? `${prefix}: ` : ''}
          {selected?.label}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className={`absolute z-50 ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'} ${panelClassName} max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 ${align === 'left' ? 'left-0' : 'left-0 sm:left-auto sm:right-0'}`}>
          {showSearch && (
            <div className="relative mx-2 mt-1 mb-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label={`Search ${ariaLabel}`}
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleListKeyDown}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-asan-accent"
              />
            </div>
          )}
          <div
            role="listbox"
            aria-label={ariaLabel}
            className="overflow-y-auto py-1"
            style={{ maxHeight: listMaxH }}
          >
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlighted;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(option.value)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`w-full text-left px-3 py-2.5 text-xs transition flex items-center gap-2 ${
                    isSelected
                      ? 'bg-asan-accent-light text-slate-900 font-bold'
                      : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold'
                  }`}
                >
                  {option.icon}
                  <span className="flex-1 truncate">{option.label}</span>
                  {isSelected && <Check className="w-4 h-4 shrink-0 text-asan-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
