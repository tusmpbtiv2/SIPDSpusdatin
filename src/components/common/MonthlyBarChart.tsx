import React, { useState, useMemo } from 'react';
import { BarChart3, Info } from 'lucide-react';

export interface MonthlyBarSeriesConfig {
  key: string;
  label: string;
  color: string; // Hex color e.g. '#315FEA', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#101D35'
  secondaryKey?: string; // e.g., unique students count key
  secondaryLabel?: string; // e.g., 'Siswa Unik'
  unit?: string; // e.g., 'transaksi', 'siswa', 'pengajuan'
}

export interface MonthlyDataPoint {
  monthIndex: number; // 0..11 (0 = Januari, 11 = Desember)
  monthKey: string; // e.g. '2026-01' or '01'
  monthShort?: string; // 'Jan'..'Des'
  monthFull?: string; // 'Januari'..'Desember'
  values: Record<string, number>;
}

export interface MonthlyBarChartProps {
  title: string;
  subtitle?: string;
  yearLabel?: string;
  data: MonthlyDataPoint[];
  series: MonthlyBarSeriesConfig[];
  height?: number;
  showValueLabels?: boolean;
  highlightMonths?: number[]; // e.g. [0,1,2,3,4,5] for Genap or [6,7,8,9,10,11] for Ganjil
  headerRight?: React.ReactNode;
  footerNote?: string;
  className?: string;
}

export const INDONESIAN_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
];

export const INDONESIAN_MONTHS_FULL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

export const MonthlyBarChart: React.FC<MonthlyBarChartProps> = ({
  title,
  subtitle,
  yearLabel,
  data,
  series,
  height = 240,
  showValueLabels = true,
  highlightMonths,
  headerRight,
  footerNote,
  className = ''
}) => {
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  // Guarantee all 12 months (Januari - Desember, index 0..11) are present and empty months are 0
  const normalizedMonths = useMemo(() => {
    const byIndex = new Map<number, MonthlyDataPoint>();
    data.forEach(item => {
      if (item.monthIndex >= 0 && item.monthIndex <= 11) {
        byIndex.set(item.monthIndex, item);
      }
    });

    return Array.from({ length: 12 }, (_, idx) => {
      const existing = byIndex.get(idx);
      const values: Record<string, number> = {};
      series.forEach(s => {
        const rawVal = existing?.values?.[s.key];
        values[s.key] = typeof rawVal === 'number' && Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
        if (s.secondaryKey) {
          const secVal = existing?.values?.[s.secondaryKey];
          values[s.secondaryKey] =
            typeof secVal === 'number' && Number.isFinite(secVal) ? Math.max(0, secVal) : 0;
        }
      });

      const mm = String(idx + 1).padStart(2, '0');
      return {
        monthIndex: idx,
        monthKey: existing?.monthKey || (yearLabel && /^\d{4}$/.test(yearLabel) ? `${yearLabel}-${mm}` : mm),
        monthShort: INDONESIAN_MONTHS_SHORT[idx],
        monthFull: INDONESIAN_MONTHS_FULL[idx],
        values
      };
    });
  }, [data, series, yearLabel]);

  // Compute max value across all months and primary series for vertical scaling
  const maxVal = useMemo(() => {
    let max = 0;
    normalizedMonths.forEach(m => {
      series.forEach(s => {
        const v = m.values[s.key] || 0;
        if (v > max) max = v;
      });
    });
    return max;
  }, [normalizedMonths, series]);

  // Nice Y-axis scale ticks (4 horizontal grid lines)
  const yAxisMax = useMemo(() => {
    if (maxVal <= 0) return 4;
    if (maxVal <= 4) return 4;
    if (maxVal <= 10) return Math.ceil(maxVal / 2) * 2;
    const step = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const normalized = Math.ceil(maxVal / (step / 2)) * (step / 2);
    return Math.max(4, normalized);
  }, [maxVal]);

  const yTicks = useMemo(() => {
    return [
      yAxisMax,
      Math.round((yAxisMax * 3) / 4),
      Math.round(yAxisMax / 2),
      Math.round(yAxisMax / 4),
      0
    ];
  }, [yAxisMax]);

  // Compute totals and peak month per series
  const seriesTotals = useMemo(() => {
    return series.map(s => {
      const total = normalizedMonths.reduce((acc, m) => acc + (m.values[s.key] || 0), 0);
      const secondaryTotal = s.secondaryKey
        ? normalizedMonths.reduce((acc, m) => acc + (m.values[s.secondaryKey!] || 0), 0)
        : undefined;
      let peakVal = 0;
      let peakMonth = '-';
      normalizedMonths.forEach(m => {
        const v = m.values[s.key] || 0;
        if (v > peakVal) {
          peakVal = v;
          peakMonth = m.monthShort || '-';
        }
      });
      return {
        ...s,
        total,
        secondaryTotal,
        peakVal,
        peakMonth
      };
    });
  }, [normalizedMonths, series]);

  const grandTotal = useMemo(
    () => seriesTotals.reduce((acc, s) => acc + s.total, 0),
    [seriesTotals]
  );

  const activeTooltipMonth =
    hoveredMonthIdx !== null ? normalizedMonths[hoveredMonthIdx] : null;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] flex flex-col justify-between ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-7 h-7 rounded-lg bg-[#EEF3FF] text-[#315FEA] flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-[#101D35] text-sm sm:text-base">{title}</h3>
            {yearLabel && (
              <span className="text-xs font-mono font-bold text-[#315FEA] tabular-nums">
                · {yearLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500 pl-9">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 bg-[#F5F7FB] px-3 py-1.5 rounded-xl border border-slate-200/70 text-xs">
            {seriesTotals.map(s => (
              <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0 inline-block"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-semibold text-slate-700">{s.label}:</span>
                <span className="font-mono font-extrabold text-[#101D35] tabular-nums">
                  {s.total.toLocaleString('id-ID')}
                </span>
                {s.secondaryTotal !== undefined && s.secondaryLabel && (
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    ({s.secondaryTotal.toLocaleString('id-ID')} {s.secondaryLabel})
                  </span>
                )}
              </div>
            ))}
          </div>
          {headerRight}
        </div>
      </div>

      {/* Interactive Tooltip Banner / Active Month Inspector */}
      <div className="mt-3 min-h-[38px] px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        {activeTooltipMonth ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#101D35]">
                {activeTooltipMonth.monthFull}{' '}
                {yearLabel && /^\d{4}$/.test(yearLabel) ? yearLabel : ''}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] text-slate-500 font-mono">
                Zona Waktu Asia/Jakarta (WIB)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {series.map(s => {
                const val = activeTooltipMonth.values[s.key] || 0;
                const secVal = s.secondaryKey
                  ? activeTooltipMonth.values[s.secondaryKey] || 0
                  : undefined;
                const sTotal = seriesTotals.find(st => st.key === s.key)?.total || 0;
                const pct = sTotal > 0 ? Math.round((val / sTotal) * 100) : 0;
                return (
                  <div key={s.key} className="flex items-center gap-1.5 font-mono tabular-nums">
                    <span
                      className="w-2 h-2 rounded-xs inline-block"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="font-sans text-slate-600">{s.label}:</span>
                    <span className="font-bold text-[#101D35]">
                      {val.toLocaleString('id-ID')} {s.unit || ''}
                    </span>
                    {secVal !== undefined && s.secondaryLabel && (
                      <span className="text-slate-500 text-[11px]">
                        ({secVal.toLocaleString('id-ID')} {s.secondaryLabel})
                      </span>
                    )}
                    <span className="text-[11px] text-[#315FEA]">({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#315FEA]" />
              <span>
                Arahkan kursor atau ketuk batang bulan (Januari–Desember) untuk melihat rincian nilai &amp; persentase. Bulan kosong ditampilkan bernilai 0.
              </span>
            </span>
            <span className="font-mono font-semibold text-slate-600 tabular-nums hidden sm:inline">
              Total Akumulasi: {grandTotal.toLocaleString('id-ID')}
            </span>
          </div>
        )}
      </div>

      {/* Vertical Bar Chart Canvas (Januari - Desember) */}
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[600px]">
          {(() => {
            const plotHeightPx = Math.max(140, height - 32);
            const maxBarHeightPx = Math.max(96, plotHeightPx - 26);

            return (
              <div className="relative flex flex-col">
                <div className="flex items-stretch" style={{ height: `${plotHeightPx}px` }}>
                  {/* Y-Axis Labels */}
                  <div className="w-10 pr-2 pt-5 flex flex-col justify-between text-right text-[10px] font-mono text-slate-400 tabular-nums select-none">
                    {yTicks.map((tick, i) => (
                      <span key={i} className="leading-none">
                        {tick.toLocaleString('id-ID')}
                      </span>
                    ))}
                  </div>

                  {/* Plot Area */}
                  <div className="flex-1 relative">
                    {/* Horizontal Grid Lines */}
                    <div className="absolute inset-x-0 top-5 bottom-0 flex flex-col justify-between pointer-events-none">
                      {yTicks.map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-full border-b ${
                            idx === yTicks.length - 1
                              ? 'border-slate-300'
                              : 'border-dashed border-slate-200/75'
                          }`}
                        />
                      ))}
                    </div>

                    {/* 12 Month Columns */}
                    <div
                      className="relative z-10 w-full h-full grid grid-cols-12 gap-1.5 sm:gap-2 px-1"
                      style={{ height: `${plotHeightPx}px` }}
                    >
                      {normalizedMonths.map(m => {
                        const isHovered = hoveredMonthIdx === m.monthIndex;
                        const isDimmedByPeriod =
                          highlightMonths &&
                          highlightMonths.length > 0 &&
                          !highlightMonths.includes(m.monthIndex);

                        return (
                          <div
                            key={m.monthIndex}
                            onMouseEnter={() => setHoveredMonthIdx(m.monthIndex)}
                            onMouseLeave={() => setHoveredMonthIdx(null)}
                            onClick={() =>
                              setHoveredMonthIdx(prev =>
                                prev === m.monthIndex ? null : m.monthIndex
                              )
                            }
                            role="button"
                            tabIndex={0}
                            aria-label={`${m.monthFull}: ${series
                              .map(s => `${s.label} ${m.values[s.key] || 0}`)
                              .join(', ')}`}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setHoveredMonthIdx(prev =>
                                  prev === m.monthIndex ? null : m.monthIndex
                                );
                              }
                            }}
                            className={`h-full flex flex-col justify-end items-center group cursor-pointer rounded-t-xl px-1 transition-colors ${
                              isHovered ? 'bg-[#EEF3FF]/70' : 'hover:bg-slate-50/80'
                            } ${isDimmedByPeriod ? 'opacity-40' : ''}`}
                          >
                            {/* Bars Group */}
                            <div className="w-full flex items-end justify-center gap-1">
                              {series.map(s => {
                                const val = m.values[s.key] || 0;
                                const barHeightPx =
                                  val > 0 && yAxisMax > 0
                                    ? Math.max(
                                        8,
                                        Math.min(
                                          maxBarHeightPx,
                                          Math.round((val / yAxisMax) * maxBarHeightPx)
                                        )
                                      )
                                    : 0;

                                return (
                                  <div
                                    key={s.key}
                                    className="flex-1 max-w-[26px] flex flex-col justify-end items-center"
                                  >
                                    {/* Value label above bar */}
                                    {showValueLabels && (
                                      <span
                                        className={`text-[10px] font-mono tabular-nums mb-1 leading-none transition-transform ${
                                          val > 0
                                            ? 'font-extrabold text-[#101D35]'
                                            : 'font-medium text-slate-400'
                                        } ${isHovered ? 'scale-110 text-[#315FEA]' : ''}`}
                                      >
                                        {val}
                                      </span>
                                    )}

                                    {/* Rounded Bar */}
                                    {val > 0 ? (
                                      <div
                                        className="w-full rounded-t-md transition-all duration-150 group-hover:opacity-95 shadow-2xs"
                                        style={{
                                          height: `${barHeightPx}px`,
                                          backgroundColor: s.color
                                        }}
                                      />
                                    ) : (
                                      /* Zero value baseline indicator */
                                      <div className="w-full h-[3px] rounded-t-sm bg-slate-200" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* X-Axis Month Labels (Jan - Des) */}
                <div className="flex items-center mt-1.5">
                  <div className="w-10 shrink-0" />
                  <div className="flex-1 grid grid-cols-12 gap-1.5 sm:gap-2 px-1 items-center">
                    {normalizedMonths.map(m => {
                      const isHovered = hoveredMonthIdx === m.monthIndex;
                      const monthSum = series.reduce((acc, s) => acc + (m.values[s.key] || 0), 0);
                      return (
                        <div
                          key={m.monthIndex}
                          className={`text-center text-[11px] font-mono transition-colors ${
                            isHovered
                              ? 'font-extrabold text-[#315FEA]'
                              : monthSum > 0
                              ? 'font-bold text-[#101D35]'
                              : 'font-medium text-slate-400'
                          }`}
                        >
                          {m.monthShort}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Summary Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          {seriesTotals.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span>Puncak {s.label}:</span>
              <strong className="font-mono text-[#101D35] tabular-nums">
                {s.peakVal > 0 ? `${s.peakMonth} (${s.peakVal})` : 'Belum ada transaksi (0)'}
              </strong>
            </span>
          ))}
        </div>
        {footerNote && <span className="text-slate-400">{footerNote}</span>}
      </div>
    </div>
  );
};
