import React, { useState, useMemo } from 'react';
import { BarChart2 } from 'lucide-react';

export interface ComparativeSeriesConfig {
  key: string;
  label: string;
  color: string;
  unit?: string;
}

export interface ComparativeDataItem {
  id: string;
  label: string;
  subLabel?: string;
  values: Record<string, number>;
}

export interface ComparativeBarChartProps {
  title: string;
  subtitle?: string;
  data: ComparativeDataItem[];
  series: ComparativeSeriesConfig[];
  orientation?: 'vertical' | 'horizontal';
  stacked?: boolean;
  height?: number;
  showValueLabels?: boolean;
  emptyMessage?: string;
  headerRight?: React.ReactNode;
  className?: string;
}

export const ComparativeBarChart: React.FC<ComparativeBarChartProps> = ({
  title,
  subtitle,
  data,
  series,
  orientation = 'vertical',
  stacked = false,
  height = 240,
  showValueLabels = true,
  emptyMessage = 'Tidak ada data untuk filter yang dipilih.',
  headerRight,
  className = ''
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const maxVal = useMemo(() => {
    let max = 0;
    data.forEach(item => {
      if (stacked) {
        const sum = series.reduce((acc, s) => acc + Math.max(0, item.values[s.key] || 0), 0);
        if (sum > max) max = sum;
      } else {
        series.forEach(s => {
          const v = Math.max(0, item.values[s.key] || 0);
          if (v > max) max = v;
        });
      }
    });
    return Math.max(1, max);
  }, [data, series, stacked]);

  const seriesTotals = useMemo(() => {
    return series.map(s => ({
      ...s,
      total: data.reduce((acc, item) => acc + Math.max(0, item.values[s.key] || 0), 0)
    }));
  }, [data, series]);

  const activeItem = useMemo(
    () => (hoveredId ? data.find(d => d.id === hoveredId) || null : null),
    [data, hoveredId]
  );

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] flex flex-col justify-between ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#EEF3FF] text-[#315FEA] flex items-center justify-center shrink-0">
              <BarChart2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-[#101D35] text-sm sm:text-base">{title}</h3>
          </div>
          {subtitle && <p className="text-xs text-slate-500 pl-9">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start">
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
              </div>
            ))}
          </div>
          {headerRight}
        </div>
      </div>

      {/* Active Tooltip / Inspector Bar */}
      {activeItem && (
        <div className="mt-3 px-3.5 py-2 rounded-xl bg-[#EEF3FF]/60 border border-[#315FEA]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-[#101D35]">
            {activeItem.label}
            {activeItem.subLabel ? (
              <span className="font-normal text-slate-500 ml-1.5">({activeItem.subLabel})</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            {series.map(s => {
              const val = Math.max(0, activeItem.values[s.key] || 0);
              return (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-xs inline-block"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-sans text-slate-600">{s.label}:</span>
                  <strong className="text-[#101D35]">
                    {val.toLocaleString('id-ID')} {s.unit || ''}
                  </strong>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">{emptyMessage}</div>
      ) : orientation === 'vertical' ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div
            className="flex items-end gap-2 sm:gap-3 pt-6 pb-2 px-1"
            style={{
              minHeight: `${height}px`,
              minWidth: `${Math.max(320, data.length * 54)}px`
            }}
          >
            {data.map(item => {
              const isHovered = hoveredId === item.id;
              const totalItemVal = series.reduce(
                (acc, s) => acc + Math.max(0, item.values[s.key] || 0),
                0
              );

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex-1 min-w-[44px] flex flex-col items-center justify-end rounded-xl p-1.5 transition-colors cursor-pointer ${
                    isHovered ? 'bg-[#EEF3FF]/70' : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Bars area */}
                  {(() => {
                    const maxBarAreaPx = Math.max(96, height - 72);
                    return (
                      <div
                        className="w-full flex items-end justify-center gap-1"
                        style={{ height: `${height - 52}px` }}
                      >
                        {stacked ? (
                          <div className="w-full max-w-[34px] flex flex-col justify-end items-center">
                            {showValueLabels && (
                              <span className="text-[10px] font-mono font-extrabold text-[#101D35] tabular-nums mb-1">
                                {totalItemVal.toLocaleString('id-ID')}
                              </span>
                            )}
                            {totalItemVal > 0 ? (
                              <div
                                className="w-full rounded-t-md overflow-hidden flex flex-col-reverse shadow-2xs"
                                style={{
                                  height: `${Math.max(
                                    8,
                                    Math.round((totalItemVal / maxVal) * maxBarAreaPx)
                                  )}px`
                                }}
                              >
                                {series.map(s => {
                                  const v = Math.max(0, item.values[s.key] || 0);
                                  const partPct =
                                    totalItemVal > 0 ? Math.round((v / totalItemVal) * 100) : 0;
                                  if (v <= 0) return null;
                                  return (
                                    <div
                                      key={s.key}
                                      style={{
                                        height: `${Math.max(partPct, 8)}%`,
                                        backgroundColor: s.color
                                      }}
                                      className="w-full transition-opacity"
                                    />
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="w-full h-[3px] bg-slate-200 rounded-t-sm" />
                            )}
                          </div>
                        ) : (
                          series.map(s => {
                            const v = Math.max(0, item.values[s.key] || 0);
                            const barHeightPx =
                              v > 0
                                ? Math.max(
                                    6,
                                    Math.min(maxBarAreaPx, Math.round((v / maxVal) * maxBarAreaPx))
                                  )
                                : 0;
                            return (
                              <div
                                key={s.key}
                                className="flex-1 max-w-[24px] flex flex-col justify-end items-center"
                              >
                                {showValueLabels && (
                                  <span
                                    className={`text-[10px] font-mono tabular-nums mb-1 leading-none ${
                                      v > 0 ? 'font-bold text-[#101D35]' : 'text-slate-400'
                                    }`}
                                  >
                                    {v}
                                  </span>
                                )}
                                {v > 0 ? (
                                  <div
                                    className="w-full rounded-t-md shadow-2xs transition-all"
                                    style={{
                                      height: `${barHeightPx}px`,
                                      backgroundColor: s.color
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-[3px] bg-slate-200 rounded-t-sm" />
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}

                  {/* X Label */}
                  <div className="mt-2 text-center">
                    <div
                      className={`text-[11px] font-mono truncate max-w-[72px] ${
                        isHovered ? 'font-extrabold text-[#315FEA]' : 'font-bold text-slate-700'
                      }`}
                      title={item.label}
                    >
                      {item.label}
                    </div>
                    {item.subLabel && (
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {item.subLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Horizontal Comparative Bars */
        <div className="mt-4 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {data.map(item => {
            const isHovered = hoveredId === item.id;
            const totalItemVal = series.reduce(
              (acc, s) => acc + Math.max(0, item.values[s.key] || 0),
              0
            );

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                  isHovered
                    ? 'bg-[#EEF3FF]/50 border-[#315FEA]/30'
                    : 'bg-[#F8FAFC] border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#101D35]">{item.label}</span>
                    {item.subLabel && (
                      <span className="text-[11px] text-slate-500 font-mono">{item.subLabel}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                    {series.map(s => (
                      <span key={s.key} className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-xs inline-block"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="text-slate-600">{s.label}:</span>
                        <strong className="text-[#101D35]">
                          {(item.values[s.key] || 0).toLocaleString('id-ID')}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>

                {stacked ? (
                  <div className="w-full h-3 bg-slate-200/80 rounded-lg overflow-hidden flex">
                    {series.map(s => {
                      const v = Math.max(0, item.values[s.key] || 0);
                      const wPct = Math.round((v / maxVal) * 100);
                      if (v <= 0) return null;
                      return (
                        <div
                          key={s.key}
                          className="h-full first:rounded-l-lg last:rounded-r-lg transition-all"
                          style={{
                            width: `${Math.max(wPct, 3)}%`,
                            backgroundColor: s.color
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {series.map(s => {
                      const v = Math.max(0, item.values[s.key] || 0);
                      const wPct = Math.round((v / maxVal) * 100);
                      return (
                        <div key={s.key} className="w-full h-2.5 bg-slate-200/80 rounded-lg overflow-hidden">
                          {v > 0 && (
                            <div
                              className="h-full rounded-r-lg transition-all"
                              style={{
                                width: `${Math.max(wPct, 3)}%`,
                                backgroundColor: s.color
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
