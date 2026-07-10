"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ExpenseRecord, SystemCategory } from '@/data/types';
import { useSettings } from '@/context/SettingsContext';

// ---------------------------------------------------------------------------
// Constants & Colors
// ---------------------------------------------------------------------------

type ViewMode = 'amount' | 'frequency';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const LIGHT_PALETTE = [
  '#100C2D',
  '#2D1361',
  '#511A7A',
  '#722A7E',
  '#95397B',
  '#B84873',
  '#E98265',
  '#F2AB7B',
  '#F7D39C'
];

const DARK_PALETTE = [
  '#161b22', // 0% / empty
  '#0e4429',
  '#006d32',
  '#26a641',
  '#39d353',
];

const CELL_SIZE = 14;
const CELL_GAP = 3;

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function DollarBillIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', pointerEvents: 'none', userSelect: 'none' }}
    >
      <rect x="0.5" y="0.5" width="19" height="11" rx="1" stroke="white" strokeWidth="1" fill="none" />
      <circle cx="3" cy="3" r="1" fill="white" />
      <circle cx="17" cy="3" r="1" fill="white" />
      <circle cx="3" cy="9" r="1" fill="white" />
      <circle cx="17" cy="9" r="1" fill="white" />
      <circle cx="10" cy="6" r="3" stroke="white" strokeWidth="1" fill="none" />
      <line x1="10" y1="3.5" x2="10" y2="8.5" stroke="white" strokeWidth="0.8" />
      <path d="M8.5 4.8 Q10 4.2 11.5 4.8" stroke="white" strokeWidth="0.7" fill="none" />
      <path d="M8.5 7.2 Q10 7.8 11.5 7.2" stroke="white" strokeWidth="0.7" fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDateRange(year: number): { start: Date; end: Date } {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Data aggregation
// ---------------------------------------------------------------------------

interface DayData {
  date: string;
  amount: number;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

function buildDayMap(
  expenses: ExpenseRecord[],
  category: string | 'All',
): Map<string, { amount: number; count: number }> {
  const map = new Map<string, { amount: number; count: number }>();
  for (const e of expenses) {
    if (category !== 'All' && e.category !== category) continue;
    const prev = map.get(e.date) ?? { amount: 0, count: 0 };
    map.set(e.date, {
      amount: prev.amount + parseFloat(e.amount.toString()),
      count: prev.count + 1,
    });
  }
  return map;
}

function buildGrid(
  expenses: ExpenseRecord[],
  category: string | 'All',
  year: number
): { days: DayData[]; startDate: Date; maxAmount: number; maxFreq: number } {
  const { start, end } = buildDateRange(year);
  const dayMap = buildDayMap(expenses, category);
  const todayStr = isoDate(new Date());

  const days: DayData[] = [];
  const cursor = new Date(start);
  
  let maxAmount = 0;
  let maxFreq = 0;

  while (cursor <= end) {
    const ds = isoDate(cursor);
    const rec = dayMap.get(ds);
    const amt = rec?.amount ?? 0;
    const cnt = rec?.count ?? 0;
    if (amt > maxAmount) maxAmount = amt;
    if (cnt > maxFreq) maxFreq = cnt;
    
    days.push({
      date: ds,
      amount: amt,
      count: cnt,
      isToday: ds === todayStr,
      isFuture: cursor > new Date(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return { days, startDate: start, maxAmount, maxFreq };
}

function getColor(value: number, max: number, palette: string[]): string {
  if (value === 0) return palette[0];
  if (max === 0) return palette[1];
  const ratio = value / max;
  const index = Math.ceil(ratio * (palette.length - 1));
  return palette[Math.min(Math.max(index, 1), palette.length - 1)];
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  day: DayData;
  vx: number;
  vy: number;
}

function HeatmapTooltip({
  state,
  viewMode,
}: {
  state: TooltipState;
  viewMode: ViewMode;
}) {
  const { day, vx, vy } = state;
  const TOOLTIP_W = 180;
  const TOOLTIP_H = 68;
  const ARROW_H = 6;
  const MARGIN = 8;

  let left = vx - TOOLTIP_W / 2;
  const right = left + TOOLTIP_W;
  if (left < MARGIN) left = MARGIN;
  if (right > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - TOOLTIP_W;

  let top = vy - TOOLTIP_H - ARROW_H - 4;
  if (top < MARGIN) top = vy + CELL_SIZE + ARROW_H + 4;

  const arrowAbove = top < vy;

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: TOOLTIP_W,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {arrowAbove && (
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #000',
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}

      <div
        style={{
          background: '#000',
          color: '#fff',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
          {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>

        {day.isFuture && (
          <div style={{ color: '#6b7280' }}>Future date</div>
        )}

        {!day.isFuture && day.count === 0 && (
          <div style={{ color: '#6b7280' }}>
            {viewMode === 'amount' ? '$0.00 spent' : 'No transactions'}
          </div>
        )}

        {!day.isFuture && day.count > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d1d5db' }}>
              <div style={{ width: 16, height: 10, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}>
                <DollarBillIcon size={10} />
              </div>
              {viewMode === 'amount'
                ? <span>${day.amount.toFixed(2)} spent</span>
                : <span>{day.count} transaction{day.count !== 1 ? 's' : ''}</span>}
            </div>
            {viewMode === 'frequency' && day.amount > 0 && (
              <div style={{ color: '#6b7280', marginTop: 2 }}>
                ${day.amount.toFixed(2)} total
              </div>
            )}
          </>
        )}
      </div>

      {!arrowAbove && (
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '6px solid #000',
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SpendingHeatmapProps {
  expenses: ExpenseRecord[];
  accountCreatedAt: string | null;
}

export function SpendingHeatmap({ expenses, accountCreatedAt }: SpendingHeatmapProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>('amount');
  const [activeCategory, setActiveCategory] = React.useState<string | 'All'>('All');
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  const currentYear = new Date().getFullYear();
  const minExpenseYear = expenses.length > 0 
    ? Math.min(...expenses.map(e => parseInt(e.date.slice(0, 4), 10))) 
    : currentYear;
  const startYear = accountCreatedAt 
    ? Math.min(new Date(accountCreatedAt).getFullYear(), minExpenseYear) 
    : minExpenseYear;

  const availableYears = React.useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= Math.min(startYear, currentYear); y--) {
      years.push(y);
    }
    return years;
  }, [currentYear, startYear]);

  const [selectedYear, setSelectedYear] = React.useState(currentYear);

  const { categories, theme } = useSettings();

  const { days, startDate, maxAmount, maxFreq } = React.useMemo(
    () => buildGrid(expenses, activeCategory, selectedYear),
    [expenses, activeCategory, selectedYear],
  );

  const palette = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [days]);

  const months = React.useMemo(() => {
    const grouped: DayData[][] = [];
    let currentMonth = -1;
    let currentMonthDays: DayData[] = [];

    days.forEach(day => {
      const m = new Date(day.date + 'T12:00:00').getMonth();
      if (m !== currentMonth) {
        if (currentMonthDays.length > 0) {
          grouped.push(currentMonthDays);
        }
        currentMonthDays = [];
        currentMonth = m;
      }
      currentMonthDays.push(day);
    });
    if (currentMonthDays.length > 0) {
      grouped.push(currentMonthDays);
    }
    return grouped;
  }, [days]);

  React.useEffect(() => {
    const dismiss = () => setTooltip(null);
    window.addEventListener('scroll', dismiss, { passive: true });
    return () => window.removeEventListener('scroll', dismiss);
  }, []);

  const DAY_LABEL_W = 32;

  // "Significant payment" defined as amount > 50% of the max amount
  const isSignificant = (amt: number) => amt > 0 && maxAmount > 0 && amt >= (maxAmount * 0.5);

  return (
    <Card className="w-full overflow-hidden bg-white dark:bg-black border-[var(--color-hairline)] dark:border-neutral-800">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-4 border-b border-[var(--color-hairline)] dark:border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <CardTitle className="text-display-md text-[var(--color-text-ink)] dark:text-white">
              Spending Heatmap
            </CardTitle>
          </div>
        </div>

        {/* ── Controls ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 flex-wrap">
          <div
            className="flex rounded-[var(--radius-sm)] border border-[var(--color-hairline)] dark:border-neutral-700 overflow-hidden"
            style={{ alignSelf: 'flex-start' }}
          >
            {(['amount', 'frequency'] as ViewMode[]).map((m) => (
              <button
                key={m}
                id={`heatmap-mode-${m}`}
                onClick={() => setViewMode(m)}
                className={cn(
                  'px-3 py-1.5 text-body-sm transition-colors duration-100',
                  viewMode === m
                    ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                    : 'bg-white text-[var(--color-text-body)] hover:bg-[var(--color-canvas-soft-2)] dark:bg-black dark:text-neutral-400 dark:hover:bg-neutral-900',
                )}
              >
                {m === 'amount' ? 'By Amount ($)' : 'By Frequency'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(['All', ...categories] as (string | 'All')[]).map((cat) => (
              <button
                key={cat}
                id={`heatmap-cat-${cat}`}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-3 py-1 rounded-[var(--radius-pill-sm)] text-body-sm border transition-colors duration-100',
                  activeCategory === cat
                    ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-medium'
                    : 'bg-white text-[var(--color-text-body)] border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)] dark:bg-black dark:text-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <CardContent className="pt-6 pb-6 w-full flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div 
            className="overflow-x-auto scroll-smooth flex-1 pb-4"
            ref={scrollRef}
          >
            <div style={{ width: 'max-content', display: 'flex', gap: 24 }}>
              {/* Day-of-week labels (Left aligned) */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
              gap: CELL_GAP,
              width: DAY_LABEL_W,
              marginTop: 24, // Matches the height + bottom margin of the month label
              flexShrink: 0,
            }}
          >
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                className="text-caption-mono text-[var(--color-text-mute)] dark:text-neutral-500 flex items-center justify-end pr-1"
                style={{
                  fontSize: 10,
                  opacity: (i === 1 || i === 3 || i === 5) ? 1 : 0,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Render each month as an independent calendar grid block */}
          {months.map((monthDays, mIdx) => {
            const blockStartDow = new Date(monthDays[0].date + 'T12:00:00').getDay();
            const blockCols = Math.ceil((monthDays.length + blockStartDow) / 7);
            const m = new Date(monthDays[0].date + 'T12:00:00').getMonth();
            const label = MONTH_LABELS[m];

            return (
              <div key={`month-block-${mIdx}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Month label */}
                <div style={{ height: 20, marginBottom: 4, position: 'relative' }}>
                  <span
                    className="absolute text-caption-mono text-[var(--color-text-mute)] dark:text-neutral-500 select-none"
                    style={{ fontSize: 10, left: 0, top: 0 }}
                  >
                    {label}
                  </span>
                </div>

                {/* Calendar grid for the month */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
                    gridTemplateColumns: `repeat(${blockCols}, ${CELL_SIZE}px)`,
                    gridAutoFlow: 'column',
                    gap: CELL_GAP,
                  }}
                >
                  {/* Padding for the start of the month */}
                  {Array.from({ length: blockStartDow }).map((_, i) => (
                    <div key={`pad-${i}`} className="bg-transparent" style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                  ))}

                  {/* Days */}
                  {monthDays.map((day) => {
                    const isFuture = day.isFuture;
                    const value = viewMode === 'amount' ? day.amount : day.count;
                    const maxVal = viewMode === 'amount' ? maxAmount : maxFreq;
                    const bgColor = getColor(value, maxVal, palette);
                    const significant = isSignificant(day.amount);

                    return (
                      <div
                        key={day.date}
                        id={`heatmap-day-${day.date}`}
                        onMouseEnter={(e) => {
                          setTooltip({
                            day,
                            vx: e.clientX,
                            vy: e.clientY,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        onMouseMove={(e) => {
                          setTooltip((prev) =>
                            prev ? { ...prev, vx: e.clientX, vy: e.clientY } : prev
                          );
                        }}
                        className="transition-transform duration-75 hover:scale-125 hover:z-10 relative flex items-center justify-center cursor-default"
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          borderRadius: 2,
                          background: bgColor,
                          border: day.isToday
                              ? '2px solid #555'
                              : 'none',
                          outline: day.isToday ? '2px solid #000' : undefined,
                          outlineOffset: day.isToday ? '2px' : undefined,
                        }}
                        aria-label={
                          isFuture
                            ? `${day.date}: future`
                            : `${day.date}: $${day.amount.toFixed(2)}, ${day.count} transaction${day.count !== 1 ? 's' : ''}`
                        }
                      >
                        {/* Dollar bill for significant spend */}
                        {significant && !isFuture && <DollarBillIcon size={8} />}
                      </div>
                    );
                  })}

                  {/* Padding at end of grid to complete the block */}
                  {Array.from({ length: (blockCols * 7) - monthDays.length - blockStartDow }).map((_, i) => (
                    <div key={`pad-end-${i}`} className="bg-transparent" style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                  ))}
                </div>
              </div>
            );
          })}
            </div>
          </div>

          {/* Years column */}
          <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-24 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={cn(
                  "px-4 py-2 text-sm rounded-md transition-colors text-left whitespace-nowrap",
                  selectedYear === year
                    ? "bg-black text-white dark:bg-white dark:text-black font-medium"
                    : "text-[var(--color-text-body)] hover:bg-[var(--color-canvas-soft-2)] dark:text-neutral-400 dark:hover:bg-neutral-800"
                )}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* ── Legend ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--color-hairline)] dark:border-neutral-800 flex-wrap gap-3">
          <div className="flex items-center gap-1.5 text-caption-mono text-[var(--color-text-mute)] dark:text-neutral-500">
            <span>Less</span>
            <div className="flex gap-1">
              {palette.map((color, i) => (
                <div 
                  key={i} 
                  style={{ width: 10, height: 10, background: color, borderRadius: 2 }} 
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {tooltip && (
        <HeatmapTooltip state={tooltip} viewMode={viewMode} />
      )}
    </Card>
  );
}
