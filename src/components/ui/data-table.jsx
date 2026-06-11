import React, { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

function getValue(row, accessor) {
  if (!accessor) return '';
  if (typeof accessor === 'function') return accessor(row);
  return row?.[accessor];
}

export function DataTable({
  columns,
  data,
  searchFields = [],
  searchPlaceholder = 'Search…',
  pageSize = 25,
  emptyMessage = 'No records found.',
  getRowKey,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: null });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim() || searchFields.length === 0) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      searchFields.some((field) => {
        const v = getValue(row, field);
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [data, query, searchFields]);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const accessor = col.sortAccessor || col.accessor || col.key;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getValue(a, accessor);
      const bv = getValue(b, accessor);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sort.dir === 'asc' ? -1 : 1;
      if (as > bs) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize]
  );

  const onSort = (colKey, sortable) => {
    if (!sortable) return;
    setSort((prev) => {
      if (prev.key !== colKey) return { key: colKey, dir: 'asc' };
      if (prev.dir === 'asc') return { key: colKey, dir: 'desc' };
      return { key: null, dir: null };
    });
  };

  return (
    <div className="space-y-3">
      {searchFields.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="pl-9 bg-card border-border"
          />
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const isSorted = sort.key === col.key;
                const Icon = !isSorted ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <TableHead
                    key={col.key}
                    className={`text-xs font-bold uppercase tracking-[0.18em] ${col.sortable ? 'cursor-pointer select-none hover:text-foreground' : ''} ${col.headClassName || ''}`}
                    onClick={() => onSort(col.key, col.sortable)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && <Icon className="w-3 h-3" />}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8 text-sm">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, idx) => (
                <TableRow key={getRowKey ? getRowKey(row) : row.id ?? idx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.cellClassName}>
                      {col.cell ? col.cell(row) : getValue(row, col.accessor || col.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="font-semibold text-xs"
            >
              Prev
            </Button>
            <span className="px-2">
              Page {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              className="font-semibold text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
