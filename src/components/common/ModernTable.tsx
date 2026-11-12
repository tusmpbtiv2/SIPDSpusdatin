import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { SearchInput } from './SearchInput';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  header: React.ReactNode;
  accessor?: keyof T;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  isMono?: boolean;
}

export interface ModernTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  actions?: React.ReactNode;
  filterControls?: React.ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  isLoading?: boolean;
  pageSize?: number;
}

export function ModernTable<T>({
  data,
  columns,
  keyExtractor,
  searchPlaceholder = 'Cari data...',
  searchFilter,
  actions,
  filterControls,
  emptyTitle = 'Tidak ada data',
  emptyMessage = 'Belum ada data yang tersimpan untuk kriteria ini.',
  emptyAction,
  isLoading = false,
  pageSize: initialPageSize = 15,
}: ModernTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim() || !searchFilter) return data;
    const query = searchQuery.trim().toLowerCase();
    return data.filter(row => searchFilter(row, query));
  }, [data, searchQuery, searchFilter]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const hasToolbar = Boolean(searchFilter || filterControls || actions);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      {hasToolbar && (
        <div className="p-4 border-b border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            {searchFilter && (
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={searchPlaceholder}
                className="max-w-sm"
              />
            )}
            {filterControls}
          </div>

          {actions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Table Body */}
      <div className="overflow-x-auto min-h-[280px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-600 font-semibold">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`py-3.5 px-4 ${
                    col.align === 'center'
                      ? 'text-center'
                      : col.align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {isLoading ? (
              <LoadingSkeleton variant="tbody" rows={6} columns={columns.length} />
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    title={emptyTitle}
                    description={emptyMessage}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={keyExtractor(row)}
                  className="hover:bg-[#F5F7FB] transition-colors duration-100 h-11"
                >
                  {columns.map((col, cIdx) => {
                    const content = col.render
                      ? col.render(row, startIndex + rIdx)
                      : col.accessor
                      ? String(row[col.accessor] ?? '-')
                      : null;

                    return (
                      <td
                        key={cIdx}
                        className={`py-2.5 px-4 ${
                          col.align === 'center'
                            ? 'text-center'
                            : col.align === 'right'
                            ? 'text-right'
                            : 'text-left'
                        } ${
                          col.isMono ? 'font-mono tabular-nums text-[#0F172A]' : ''
                        } ${col.className || ''}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && filteredData.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200/80 bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              Menampilkan{' '}
              <span className="font-bold text-[#0F172A] tabular-nums">{startIndex + 1}</span> –{' '}
              <span className="font-bold text-[#0F172A] tabular-nums">
                {Math.min(startIndex + pageSize, filteredData.length)}
              </span>{' '}
              dari{' '}
              <span className="font-bold text-[#0F172A] tabular-nums">
                {filteredData.length.toLocaleString('id-ID')}
              </span>{' '}
              data
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Baris:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#315FEA]"
                aria-label="Jumlah baris per halaman"
              >
                {[10, 15, 25, 50, 100].map(sz => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
              aria-label="Halaman pertama"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-semibold tabular-nums text-[#0F172A]">
              {validCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
              aria-label="Halaman terakhir"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const DataTable = ModernTable;

