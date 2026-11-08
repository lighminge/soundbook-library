import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

interface PaginationBarProps {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  unitLabel?: string;
}

/**
 * 通用分頁列（每頁筆數以 10 的倍數選取）
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unitLabel = '筆',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  // 頁碼按鈕（最多顯示 7 個）
  const pageNumbers: number[] = [];
  const windowSize = 7;
  let from = Math.max(1, safePage - Math.floor(windowSize / 2));
  const to = Math.min(totalPages, from + windowSize - 1);
  from = Math.max(1, to - windowSize + 1);
  for (let i = from; i <= to; i++) pageNumbers.push(i);

  const btnBase =
    'min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2 text-xs text-[#6E5D4F]">
        <span>每頁顯示</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold text-[#5C3A1B] focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} {unitLabel}
            </option>
          ))}
        </select>
        <span>
          第 <strong className="font-mono text-[#3A2518]">{startIdx}</strong> -{' '}
          <strong className="font-mono text-[#3A2518]">{endIdx}</strong> {unitLabel}，共{' '}
          <strong className="font-mono text-[#3A2518]">{totalItems}</strong> {unitLabel}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          className={`${btnBase} bg-white border-[#E5D9C5] text-[#5C3A1B] hover:bg-[#F3ECE0]`}
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          title="第一頁"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={`${btnBase} bg-white border-[#E5D9C5] text-[#5C3A1B] hover:bg-[#F3ECE0]`}
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          title="上一頁"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageNumbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            className={`${btnBase} ${
              n === safePage
                ? 'bg-[#8B5A2B] border-[#8B5A2B] text-white'
                : 'bg-white border-[#E5D9C5] text-[#5C3A1B] hover:bg-[#F3ECE0]'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`${btnBase} bg-white border-[#E5D9C5] text-[#5C3A1B] hover:bg-[#F3ECE0]`}
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          title="下一頁"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={`${btnBase} bg-white border-[#E5D9C5] text-[#5C3A1B] hover:bg-[#F3ECE0]`}
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          title="最後一頁"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-[#6E5D4F] ml-1.5">
          第 {safePage} / {totalPages} 頁
        </span>
      </div>
    </div>
  );
};

/** 將 yyyy-mm-dd 轉換為當日 00:00:00 的時間戳（本地時區） */
export function dateInputToStartMs(value: string): number | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** 將 yyyy-mm-dd 轉換為當日 23:59:59.999 的時間戳（本地時區） */
export function dateInputToEndMs(value: string): number | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
