import { useMemo, useState } from "react";

type UseTableOptions<T> = {
  rows: T[];
  filter: (row: T, query: string) => boolean;
  pageSize?: number;
};

export function useTable<T>({ rows, filter, pageSize = 10 }: UseTableOptions<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => filter(row, q));
  }, [rows, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  function next() {
    setPage((p) => Math.min(p + 1, pageCount));
  }

  function prev() {
    setPage((p) => Math.max(p - 1, 1));
  }

  function reset() {
    setPage(1);
  }

  return {
    query,
    setQuery,
    page: currentPage,
    pageCount,
    pageItems,
    total: filtered.length,
    next,
    prev,
    reset
  };
}
