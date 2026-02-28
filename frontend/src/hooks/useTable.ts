import { useMemo, useState } from "react";
import { getHashParam, setHashParam } from "../utils/hashParams";

type UseTableOptions<T> = {
  rows: T[];
  filter: (row: T, query: string) => boolean;
  pageSize?: number;
  stateKey?: string;
};

export function useTable<T>({ rows, filter, pageSize = 10, stateKey }: UseTableOptions<T>) {
  const qKey = stateKey ? `${stateKey}_q` : "";
  const pKey = stateKey ? `${stateKey}_p` : "";
  const [query, setQueryRaw] = useState(() => (qKey ? getHashParam(qKey, "") : ""));
  const [page, setPageRaw] = useState(() => {
    if (!pKey) return 1;
    const v = Number(getHashParam(pKey, "1"));
    return Number.isFinite(v) && v > 0 ? v : 1;
  });

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
    setPage(Math.min(currentPage + 1, pageCount));
  }

  function prev() {
    setPage(Math.max(currentPage - 1, 1));
  }

  function setQuery(value: string) {
    setQueryRaw(value);
    if (qKey) setHashParam(qKey, value || null);
  }

  function setPage(value: number) {
    const safe = Math.max(1, value);
    setPageRaw(safe);
    if (pKey) setHashParam(pKey, String(safe));
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
