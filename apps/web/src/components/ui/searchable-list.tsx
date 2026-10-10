'use client';
import { useState, type ReactNode } from 'react';
export interface DisplayRow {
  id: string;
  searchText: string;
  content: ReactNode;
}
export function searchRows(rows: DisplayRow[], search: string) {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => row.searchText.toLowerCase().includes(query));
}
export function SearchableList({
  rows,
  label,
}: {
  rows: DisplayRow[];
  label: string;
}) {
  const [search, setSearch] = useState('');
  const visible = searchRows(rows, search);
  return (
    <div className="min-w-0 space-y-3">
      <label className="form-label block max-w-md">
        {label}
        <input
          className="form-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the loaded history"
        />
      </label>
      <p role="status" className="text-xs text-muted-foreground">
        Showing {visible.length} of {rows.length} loaded records. Pagination
        remains separate.
      </p>
      <div role="list" className="space-y-3">
        {visible.map((row) => (
          <div role="listitem" key={row.id}>
            {row.content}
          </div>
        ))}
      </div>
      {!visible.length && rows.length > 0 && (
        <p className="empty-panel text-sm">
          No loaded records match your search. Clear the search or check another
          page.
        </p>
      )}
    </div>
  );
}
