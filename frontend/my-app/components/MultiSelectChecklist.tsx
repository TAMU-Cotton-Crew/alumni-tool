"use client";

import { useState } from "react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  columns?: 1 | 2 | 3;
}

// Checkbox list for picking any number of options, with an optional search box
export default function MultiSelectChecklist({
  options,
  selected,
  onChange,
  searchable = false,
  columns = 2,
}: Props) {
  const [query, setQuery] = useState("");
  const visible = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option],
    );

  const gridCols =
    columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";

  return (
    <div>
      {searchable && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3 mb-3"
        />
      )}
      {selected.length > 0 && (
        <p className="text-sm text-gray-600 mb-2">{selected.length} selected</p>
      )}
      <div className={`grid grid-cols-1 ${gridCols} gap-2`}>
        {visible.map((option) => (
          <label key={option} className="flex items-center gap-3 text-lg text-gray-800">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              className="w-5 h-5"
            />
            {option}
          </label>
        ))}
        {visible.length === 0 && (
          <p className="text-gray-600">No matches for &ldquo;{query}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}
