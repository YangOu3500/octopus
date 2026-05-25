'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useStatsObservability, type StatsObservabilityBreakdown } from '@/api/endpoints/stats';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHomeViewStore, type RankSortMode } from './store';
import { cn, formatCount, formatMoney } from '@/lib/utils';
import { Award, Percent, TrendingUp, Zap } from 'lucide-react';

type TabType = 'keys' | 'models' | 'channels' | 'sources';

export function TopRankings({ className }: { className?: string }) {
    const t = useTranslations('home.rank');
    const obsT = useTranslations('home.observability');
    const { data: obsData } = useStatsObservability('24h');

    const sortMode = useHomeViewStore((state) => state.rankSortMode);
    const setSortMode = useHomeViewStore((state) => state.setRankSortMode);
    const [activeTab, setActiveTab] = useState<TabType>('keys');

    // Get active list
    const rawList = useMemo<StatsObservabilityBreakdown[]>(() => {
        if (!obsData) return [];
        switch (activeTab) {
            case 'keys':
                return obsData.top_api_keys ?? [];
            case 'models':
                return obsData.top_models ?? [];
            case 'channels':
                return obsData.top_channels ?? [];
            case 'sources':
                return obsData.source_breakdown ?? [];
            default:
                return [];
        }
    }, [obsData, activeTab]);

    // Sort and limit items
    const sortedList = useMemo(() => {
        return [...rawList].sort((a, b) => {
            if (sortMode === 'cost') {
                return (b.cost ?? 0) - (a.cost ?? 0);
            }
            if (sortMode === 'count') {
                return b.requests - a.requests;
            }
            return (b.cost ?? 0) - (a.cost ?? 0) || b.requests - a.requests;
        });
    }, [rawList, sortMode]);

    // Chart config for Shadcn/ui Chart
    const chartConfig = {
        value: {
            label: sortMode === 'cost' ? t('sortByCost') : sortMode === 'count' ? t('sortByCount') : t('sortByTokens'),
            color: 'hsl(var(--primary))',
        },
    };

    // Chart data (top 5)
    const chartData = useMemo(() => {
        return sortedList.slice(0, 5).map((item) => {
            let value = 0;
            if (sortMode === 'cost') {
                value = item.cost ?? 0;
            } else if (sortMode === 'count') {
                value = item.requests;
            } else {
                value = item.cost ?? 0;
            }

            return {
                name: item.name || '—',
                value,
                displayValue: sortMode === 'cost' ? `$${value.toFixed(4)}` : value.toLocaleString(),
            };
        });
    }, [sortedList, sortMode]);

    const handleSortChange = (mode: RankSortMode) => {
        setSortMode(mode);
    };

    return (
        <section className={cn('rounded-xl border border-border bg-card p-5 shadow-2xs flex flex-col', className)}>
            {/* Header: title and sorting pills */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
                        <Award className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground">{t('title')}</h3>
                        <p className="text-xs text-muted-foreground">{obsT('range24h')}</p>
                    </div>
                </div>

                {/* Custom sort selector to feel like Vercel */}
                <div className="flex bg-muted p-0.5 rounded-lg border border-border/30 h-8 self-start sm:self-center">
                    {(['cost', 'count'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => handleSortChange(mode)}
                            className={cn(
                                'text-xs px-3 py-1 font-semibold rounded-md transition-all',
                                sortMode === mode
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {mode === 'cost' ? t('sortByCost') : t('sortByCount')}
                        </button>
                    ))}
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full flex-1 flex flex-col">
                <TabsList className="bg-muted p-0.5 rounded-lg border border-border/30 h-9 w-fit mb-4">
                    <TabsTrigger value="keys" className="text-xs px-3.5 py-1 rounded-md">{t('keys')}</TabsTrigger>
                    <TabsTrigger value="models" className="text-xs px-3.5 py-1 rounded-md">{t('models')}</TabsTrigger>
                    <TabsTrigger value="channels" className="text-xs px-3.5 py-1 rounded-md">{t('channels')}</TabsTrigger>
                    <TabsTrigger value="sources" className="text-xs px-3.5 py-1 rounded-md">{t('sources')}</TabsTrigger>
                </TabsList>

                {sortedList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-xl bg-background/10">
                        <TrendingUp className="h-8 w-8 text-muted-foreground/45 mb-2" />
                        <span className="text-sm font-semibold text-muted-foreground">{t('noData')}</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 items-start">
                        {/* Left side: Horizontal Bar Chart */}
                        <div className="rounded-xl border border-border/50 bg-background/20 p-4 flex flex-col justify-between">
                            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {t('top5', { type: t(activeTab) })}
                            </div>
                            <div style={{ height: `${Math.max(80, chartData.length * 32)}px` }} className="w-full">
                                <ChartContainer config={chartConfig} className="h-full w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={chartData}
                                            layout="vertical"
                                            margin={{ left: -10, right: 10, top: 0, bottom: 0 }}
                                        >
                                            <XAxis type="number" hide />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                stroke="hsl(var(--foreground) / 0.55)"
                                                fontSize={10}
                                                width={90}
                                                tickLine={false}
                                                axisLine={false}
                                                className="font-semibold"
                                            />
                                            <ChartTooltip
                                                cursor={{ fill: 'hsl(var(--border) / 0.15)' }}
                                                content={<ChartTooltipContent hideLabel />}
                                            />
                                            <Bar
                                                dataKey="value"
                                                fill="var(--color-value)"
                                                radius={[0, 4, 4, 0]}
                                                barSize={14}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            </div>
                        </div>

                        {/* Right side: Ranked List */}
                        <div className="border border-border rounded-xl bg-background/20 overflow-hidden">
                            <div className="divide-y divide-border/60">
                                {sortedList.map((item, index) => {
                                    const valueFormatted =
                                        sortMode === 'cost'
                                            ? formatMoney(item.cost ?? 0).formatted
                                            : formatCount(item.requests).formatted;
                                    const successRate = item.success_rate * 100;

                                    return (
                                        <article
                                            key={`${item.name}-${index}`}
                                            className="px-4 py-3 hover:bg-muted/40 transition-colors duration-150 flex items-center justify-between gap-4"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <span className="text-xs font-mono font-bold text-muted-foreground w-4 shrink-0">
                                                    #{index + 1}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-foreground truncate" title={item.name}>
                                                        {item.name || '—'}
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/80 font-medium">
                                                        <span className="inline-flex items-center gap-1">
                                                            <Zap className="h-3 w-3 shrink-0" />
                                                            {t('reqs', { count: item.requests })}
                                                        </span>
                                                        <span>·</span>
                                                        <span
                                                            className={cn(
                                                                'inline-flex items-center gap-1',
                                                                successRate < 95
                                                                    ? 'text-amber-500 font-semibold'
                                                                    : 'text-muted-foreground'
                                                            )}
                                                        >
                                                            <Percent className="h-3 w-3 shrink-0" />
                                                            {successRate.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <div className="text-xs font-bold text-foreground tabular-nums">
                                                    {sortMode === 'cost' && '$'}
                                                    {valueFormatted.value}
                                                    {sortMode !== 'cost' && valueFormatted.unit}
                                                </div>
                                                {sortMode === 'cost' && valueFormatted.unit && (
                                                    <div className="text-[9px] text-muted-foreground/75 font-semibold mt-0.5">
                                                        {valueFormatted.unit}
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </Tabs>
        </section>
    );
}
