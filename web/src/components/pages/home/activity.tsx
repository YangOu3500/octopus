'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useStatsDaily } from '@/api/endpoints/stats';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Activity as ActivityIcon } from 'lucide-react';

type ActivityMetric = 'requests' | 'cost' | 'tokens' | 'latency';

export function ActivityHeatmap({ className }: { className?: string }) {
    const t = useTranslations('home.activity');
    const sectionsT = useTranslations('home.sections.activity');
    const { data: daily = [] } = useStatsDaily();

    const [metric, setMetric] = useState<ActivityMetric>('requests');

    // 1. Generate last 26 weeks of dates (starting on a Sunday and ending on a Saturday)
    const { days, colMonthLabels } = useMemo(() => {
        const today = new Date();
        const currentDayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday

        // endDate is this week Saturday
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + (6 - currentDayOfWeek));

        // startDate is 26 weeks ago Sunday (182 days total)
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 181);

        const generatedDays: Date[] = [];
        const curr = new Date(startDate);
        while (curr <= endDate) {
            generatedDays.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        // Generate month labels mapped to column indices (0-25)
        const monthLabels: { index: number; label: string }[] = [];
        let prevMonthName = '';
        for (let c = 0; c < 26; c++) {
            const dayIndex = c * 7;
            const date = generatedDays[dayIndex];
            const monthName = date.toLocaleString('default', { month: 'short' });
            if (monthName !== prevMonthName) {
                monthLabels.push({ index: c, label: monthName });
                prevMonthName = monthName;
            }
        }

        return { days: generatedDays, colMonthLabels: monthLabels };
    }, []);

    // 2. Map date string 'YYYYMMDD' to daily stats
    const statsMap = useMemo(() => {
        const map = new Map<string, (typeof daily)[number]>();
        daily.forEach((item) => {
            map.set(item.date, item);
        });
        return map;
    }, [daily]);

    // 3. Format Date object to YYYYMMDD string
    const getFormattedDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    };

    // 4. Calculate maximum value of the active metric to determine color intensity levels
    const maxVal = useMemo(() => {
        let max = 0;
        days.forEach((date) => {
            const dateStr = getFormattedDateString(date);
            const item = statsMap.get(dateStr);
            if (!item) return;

            let val = 0;
            if (metric === 'requests') {
                val = item.request_count.raw;
            } else if (metric === 'cost') {
                val = item.total_cost.raw;
            } else if (metric === 'tokens') {
                val = item.total_token.raw;
            } else if (metric === 'latency') {
                val = item.wait_time.raw;
            }

            if (val > max) max = val;
        });
        return max;
    }, [days, statsMap, metric]);

    // 5. Build cell data with tooltip labels and levels
    const cellData = useMemo(() => {
        return days.map((date) => {
            const dateStr = getFormattedDateString(date);
            const item = statsMap.get(dateStr);
            const formattedDate = date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });

            let rawValue = 0;
            let displayString = '';

            if (item) {
                if (metric === 'requests') {
                    rawValue = item.request_count.raw;
                    displayString = `${item.request_count.formatted.value}${item.request_count.formatted.unit} requests`;
                } else if (metric === 'cost') {
                    rawValue = item.total_cost.raw;
                    displayString = `$${item.total_cost.formatted.value}${item.total_cost.formatted.unit.replace('$', '')}`;
                } else if (metric === 'tokens') {
                    rawValue = item.total_token.raw;
                    displayString = `${item.total_token.formatted.value}${item.total_token.formatted.unit} tokens`;
                } else if (metric === 'latency') {
                    rawValue = item.wait_time.raw;
                    displayString = `${item.wait_time.formatted.value}${item.wait_time.formatted.unit} latency`;
                }
            } else {
                displayString = t('noData');
            }

            // Determine level (0 to 4)
            let level = 0;
            if (rawValue > 0 && maxVal > 0) {
                const ratio = rawValue / maxVal;
                if (ratio <= 0.25) level = 1;
                else if (ratio <= 0.5) level = 2;
                else if (ratio <= 0.75) level = 3;
                else level = 4;
            }

            return {
                dateStr,
                formattedDate,
                rawValue,
                displayString,
                level,
            };
        });
    }, [days, statsMap, metric, maxVal, t]);

    return (
        <section className={cn('rounded-xl border border-border bg-card p-5 shadow-2xs flex flex-col', className)}>
            {/* Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
                        <ActivityIcon className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">{sectionsT('title')}</h2>
                        <p className="text-xs text-muted-foreground">{sectionsT('description')}</p>
                    </div>
                </div>

                {/* Metric Selectors */}
                <div className="flex bg-muted p-0.5 rounded-lg border border-border/30 h-8 self-start sm:self-center">
                    {(['requests', 'cost', 'tokens', 'latency'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMetric(m)}
                            className={cn(
                                'text-xs px-3 py-1 font-semibold rounded-md transition-all',
                                metric === m
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {m === 'requests' ? t('requestCount') : m === 'cost' ? t('totalCost') : m === 'tokens' ? t('totalToken') : t('waitTime')}
                        </button>
                    ))}
                </div>
            </header>

            {/* Grid Container */}
            <div className="overflow-x-auto -mx-5 px-5 pb-2">
                <div className="min-w-[420px] flex flex-col gap-1.5 select-none">
                    {/* Month Header Row */}
                    <div className="grid grid-cols-[24px_repeat(26,minmax(0,1fr))] gap-1 text-[10px] text-muted-foreground font-semibold h-4">
                        <div />
                        {colMonthLabels.map((item) => (
                            <div
                                key={item.index}
                                style={{ gridColumnStart: item.index + 2 }}
                                className="truncate pl-0.5"
                            >
                                {item.label}
                            </div>
                        ))}
                    </div>

                    {/* Day Rows + Heatmap */}
                    <div className="flex gap-2 items-start">
                        {/* Day labels on left */}
                        <div className="grid grid-rows-7 gap-1 text-[9px] text-muted-foreground font-semibold h-[104px] justify-end pr-1 pt-[2px] w-6 shrink-0">
                            <div className="h-3 leading-none flex items-center justify-end" />
                            <div className="h-3 leading-none flex items-center justify-end">Mon</div>
                            <div className="h-3 leading-none flex items-center justify-end" />
                            <div className="h-3 leading-none flex items-center justify-end">Wed</div>
                            <div className="h-3 leading-none flex items-center justify-end" />
                            <div className="h-3 leading-none flex items-center justify-end">Fri</div>
                            <div className="h-3 leading-none flex items-center justify-end" />
                        </div>

                        {/* Calendar Matrix */}
                        <TooltipProvider>
                            <div className="grid grid-flow-col grid-rows-7 gap-1 flex-1 h-[104px]">
                                {cellData.map((cell, idx) => (
                                    <Tooltip key={`${cell.dateStr}-${idx}`}>
                                        <TooltipTrigger asChild>
                                            <div
                                                className={cn(
                                                    'size-3 rounded-[2px] transition-all cursor-crosshair border border-transparent',
                                                    cell.level === 0 && 'bg-muted/40 border-muted/5 dark:bg-muted/10',
                                                    cell.level === 1 && 'bg-primary/20 dark:bg-primary/15',
                                                    cell.level === 2 && 'bg-primary/45 dark:bg-primary/35',
                                                    cell.level === 3 && 'bg-primary/75 dark:bg-primary/65',
                                                    cell.level === 4 && 'bg-primary dark:bg-primary/90'
                                                )}
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent className="border border-border/80 shadow-md">
                                            <div className="font-bold text-[10px] text-foreground">{cell.formattedDate}</div>
                                            <div className="mt-0.5 text-xs font-semibold font-mono text-muted-foreground">{cell.displayString}</div>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <footer className="mt-4 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <span>Less</span>
                <div className="size-2.5 rounded-[1px] bg-muted/40 dark:bg-muted/10" />
                <div className="size-2.5 rounded-[1px] bg-primary/20 dark:bg-primary/15" />
                <div className="size-2.5 rounded-[1px] bg-primary/45 dark:bg-primary/35" />
                <div className="size-2.5 rounded-[1px] bg-primary/75 dark:bg-primary/65" />
                <div className="size-2.5 rounded-[1px] bg-primary dark:bg-primary/90" />
                <span>More</span>
            </footer>
        </section>
    );
}
