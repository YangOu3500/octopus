'use client';

import { useStatsDaily, useStatsHourly, useStatsTotal } from '@/api/endpoints/stats';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslations } from 'next-intl';
import { cn, formatCount, formatMoney, formatTime } from '@/lib/utils';
import dayjs from 'dayjs';
import { AnimatedNumber } from '@/components/common/AnimatedNumber';
import { Tabs, TabsList, TabsTrigger } from '@/components/animate-ui/components/animate/tabs';
import { useHomeViewStore, type ChartPeriod } from '@/components/modules/home/store';

type Formatted = { value: string; unit: string };

type MetricsRow = {
    requests: Formatted;
    tokens: Formatted;
    waitTime: Formatted;
};

type HeroValue = {
    value: string | undefined;
    unit: string;
};

type ChartPoint = { date: string; total_cost: number; requests: number; tokens: number };

const PERIOD_KEY: Record<ChartPeriod, 'today' | 'last7Days' | 'last30Days' | 'allTime'> = {
    '1': 'today',
    '7': 'last7Days',
    '30': 'last30Days',
    all: 'allTime',
};

export function StatsChart({ className }: { className?: string }) {
    const t = useTranslations('home.summary');

    const { data: statsTotal } = useStatsTotal();
    const { data: statsDaily } = useStatsDaily();
    const { data: statsHourly } = useStatsHourly();

    const period = useHomeViewStore((state) => state.chartPeriod);
    const setChartPeriod = useHomeViewStore((state) => state.setChartPeriod);

    const sortedDaily = useMemo(() => {
        if (!statsDaily) return [];
        return [...statsDaily].sort((a, b) => a.date.localeCompare(b.date));
    }, [statsDaily]);

    const { hero, metrics, chartData } = useMemo<{
        hero: HeroValue;
        metrics: MetricsRow;
        chartData: ChartPoint[];
    }>(() => {
        const emptyMetrics: MetricsRow = {
            requests: formatCount(0).formatted,
            tokens: formatCount(0).formatted,
            waitTime: formatTime(0).formatted,
        };
        const emptyHero: HeroValue = { value: undefined, unit: '' };

        if (period === 'all') {
            // 累计档：优先使用 statsTotal；否则 fallback 到 statsDaily 全量聚合
            const points: ChartPoint[] = sortedDaily.map((stat) => ({
                date: dayjs(stat.date).format('MM/DD'),
                total_cost: stat.total_cost.raw,
                requests: stat.request_count.raw,
                tokens: stat.total_token.raw,
            }));

            if (statsTotal) {
                return {
                    hero: {
                        value: statsTotal.total_cost.formatted.value,
                        unit: statsTotal.total_cost.formatted.unit,
                    },
                    metrics: {
                        requests: statsTotal.request_count.formatted,
                        tokens: statsTotal.total_token.formatted,
                        waitTime: statsTotal.wait_time.formatted,
                    },
                    chartData: points,
                };
            }

            if (sortedDaily.length === 0) {
                const points = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 6 + i);
                    return { date: dayjs(d).format('MM/DD'), total_cost: 0, requests: 0, tokens: 0 };
                });
                const costFmt = formatMoney(0).formatted;
                return {
                    hero: { value: costFmt.value, unit: costFmt.unit },
                    metrics: {
                        requests: formatCount(0).formatted,
                        tokens: formatCount(0).formatted,
                        waitTime: formatTime(0).formatted,
                    },
                    chartData: points,
                };
            }

            const cost = sortedDaily.reduce((acc, s) => acc + s.total_cost.raw, 0);
            const requests = sortedDaily.reduce((acc, s) => acc + s.request_count.raw, 0);
            const tokens = sortedDaily.reduce((acc, s) => acc + s.total_token.raw, 0);
            const wait = sortedDaily.reduce((acc, s) => acc + s.wait_time.raw, 0);
            const costFmt = formatMoney(cost).formatted;
            return {
                hero: { value: costFmt.value, unit: costFmt.unit },
                metrics: {
                    requests: formatCount(requests).formatted,
                    tokens: formatCount(tokens).formatted,
                    waitTime: formatTime(wait).formatted,
                },
                chartData: points,
            };
        }

        if (period === '1') {
            // 今日档：聚合 statsHourly
            if (!statsHourly || statsHourly.length === 0) {
                const currentHour = new Date().getHours();
                const points = Array.from({ length: Math.max(6, currentHour + 1) }, (_, i) => ({
                    date: `${i.toString().padStart(2, '0')}:00`,
                    total_cost: 0,
                    requests: 0,
                    tokens: 0,
                }));
                const costFmt = formatMoney(0).formatted;
                return {
                    hero: { value: costFmt.value, unit: costFmt.unit },
                    metrics: {
                        requests: formatCount(0).formatted,
                        tokens: formatCount(0).formatted,
                        waitTime: formatTime(0).formatted,
                    },
                    chartData: points,
                };
            }
            const points: ChartPoint[] = statsHourly.map((stat) => ({
                date: `${stat.hour}:00`,
                total_cost: stat.total_cost.raw,
                requests: stat.request_count.raw,
                tokens: stat.total_token.raw,
            }));
            const cost = statsHourly.reduce((acc, s) => acc + s.total_cost.raw, 0);
            const requests = statsHourly.reduce((acc, s) => acc + s.request_count.raw, 0);
            const tokens = statsHourly.reduce((acc, s) => acc + s.total_token.raw, 0);
            const wait = statsHourly.reduce((acc, s) => acc + s.wait_time.raw, 0);
            const costFmt = formatMoney(cost).formatted;
            return {
                hero: { value: costFmt.value, unit: costFmt.unit },
                metrics: {
                    requests: formatCount(requests).formatted,
                    tokens: formatCount(tokens).formatted,
                    waitTime: formatTime(wait).formatted,
                },
                chartData: points,
            };
        }

        // 7 / 30 天：聚合 statsDaily
        const days = Number(period);
        const recent = sortedDaily.slice(-days);
        const points: ChartPoint[] = recent.map((stat) => ({
            date: dayjs(stat.date).format('MM/DD'),
            total_cost: stat.total_cost.raw,
            requests: stat.request_count.raw,
            tokens: stat.total_token.raw,
        }));

        if (recent.length === 0) {
            const points = Array.from({ length: days }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (days - 1) + i);
                return { date: dayjs(d).format('MM/DD'), total_cost: 0, requests: 0, tokens: 0 };
            });
            const costFmt = formatMoney(0).formatted;
            return {
                hero: { value: costFmt.value, unit: costFmt.unit },
                metrics: {
                    requests: formatCount(0).formatted,
                    tokens: formatCount(0).formatted,
                    waitTime: formatTime(0).formatted,
                },
                chartData: points,
            };
        }

        const cost = recent.reduce((acc, s) => acc + s.total_cost.raw, 0);
        const requests = recent.reduce((acc, s) => acc + s.request_count.raw, 0);
        const tokens = recent.reduce((acc, s) => acc + s.total_token.raw, 0);
        const wait = recent.reduce((acc, s) => acc + s.wait_time.raw, 0);
        const costFmt = formatMoney(cost).formatted;
        return {
            hero: { value: costFmt.value, unit: costFmt.unit },
            metrics: {
                requests: formatCount(requests).formatted,
                tokens: formatCount(tokens).formatted,
                waitTime: formatTime(wait).formatted,
            },
            chartData: points,
        };
    }, [period, statsTotal, statsHourly, sortedDaily]);

    const chartConfig = useMemo(
        () => ({
            tokens: { label: t('metrics.tokens'), color: 'hsl(var(--primary) / 0.7)' },
            requests: { label: t('metrics.requests'), color: 'hsl(var(--chart-2))' },
            total_cost: { label: t('headline.allTime'), color: 'hsl(var(--chart-3))' },
        }),
        [t]
    );

    // hero unit 处理：formatMoney 返回 unit 形如 '$' / 'K$' / 'M$' / 'B$'
    // 展示时 $ 前置、其余单位（K/M/B）后置。
    const heroUnitSuffix = useMemo(() => {
        if (!hero.unit) return '';
        // 去掉结尾 $ 留下数量级字符
        if (hero.unit === '$') return '';
        return hero.unit.replace(/\$$/, '');
    }, [hero.unit]);

    return (
        <section className={cn("fluent-card flex flex-col", className)}>
            {/* Header: hero + tabs */}
            <header className="flex flex-col gap-3 px-5 pb-3 pt-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-[11px] font-black tracking-wider uppercase text-muted-foreground">{t(`headline.${PERIOD_KEY[period]}`)}</p>
                    <p className="mt-1.5 text-3xl font-black tracking-tight tabular-nums md:text-4xl text-primary drop-shadow-sm">
                        {hero.value === undefined ? (
                            <span className="text-muted-foreground">—</span>
                        ) : (
                            <>
                                <span className="mr-1.5 text-lg font-bold text-primary/70">$</span>
                                <AnimatedNumber value={hero.value} />
                                {heroUnitSuffix && (
                                    <span className="ml-1 text-base font-bold text-muted-foreground/80">{heroUnitSuffix}</span>
                                )}
                            </>
                        )}
                    </p>
                </div>
                <Tabs value={period} onValueChange={(v) => setChartPeriod(v as ChartPeriod)}>
                    <TabsList className="bg-muted/50 border border-border/30">
                        <TabsTrigger value="1" className="text-xs font-medium">{t('periods.today')}</TabsTrigger>
                        <TabsTrigger value="7" className="text-xs font-medium">{t('periods.last7Days')}</TabsTrigger>
                        <TabsTrigger value="30" className="text-xs font-medium">{t('periods.last30Days')}</TabsTrigger>
                        <TabsTrigger value="all" className="text-xs font-medium">{t('periods.allTime')}</TabsTrigger>
                    </TabsList>
                </Tabs>
            </header>

            {/* Metrics row */}
            <div className="mx-5 flex flex-wrap items-baseline gap-5 border-t border-border/30 py-3.5 text-xs font-semibold uppercase tracking-wider tabular-nums text-muted-foreground">
                <StatItem label={t('metrics.requests')} value={metrics.requests} />
                <span className="h-3.5 w-px bg-border/20" />
                <StatItem label={t('metrics.tokens')} value={metrics.tokens} />
                <span className="h-3.5 w-px bg-border/20" />
                <StatItem label={t('metrics.waitTime')} value={metrics.waitTime} />
            </div>

            {/* Area chart */}
            <div className="mx-5 mb-5 p-3 rounded-2xl flex-1 flex flex-col min-h-[300px] border border-border/60 bg-background/30">
                <ChartContainer config={chartConfig} className="h-full w-full flex-1 px-1">
                <AreaChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-total_cost)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--color-total_cost)" stopOpacity={0.0} />
                        </linearGradient>
                        <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(var(--border) / 0.4)" />
                    <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tickMargin={8} 
                        stroke="oklch(var(--foreground) / 0.55)"
                        className="text-[10px] font-semibold tracking-wider font-mono"
                    />
                    <YAxis
                        yAxisId="left"
                        orientation="left"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        stroke="oklch(var(--foreground) / 0.55)"
                        className="text-[10px] font-semibold tracking-wider font-mono"
                        tickFormatter={(value) => formatCount(value).formatted.value + formatCount(value).formatted.unit}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        stroke="oklch(var(--foreground) / 0.55)"
                        className="text-[10px] font-semibold tracking-wider font-mono"
                        tickFormatter={(value) => {
                            const formatted = formatMoney(value);
                            return `$${formatted.formatted.value}${formatted.formatted.unit.replace('$', '')}`;
                        }}
                    />
                    <ChartTooltip cursor={{ stroke: 'oklch(var(--border) / 0.3)', strokeWidth: 1 }} content={<ChartTooltipContent indicator="line" />} />
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="tokens"
                        stroke="var(--color-tokens)"
                        strokeWidth={2}
                        fill="url(#fillTokens)"
                    />
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="requests"
                        stroke="var(--color-requests)"
                        strokeWidth={2}
                        fill="url(#fillRequests)"
                    />
                    <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="total_cost"
                        stroke="var(--color-total_cost)"
                        strokeWidth={2}
                        fill="url(#fillCost)"
                    />
                </AreaChart>
                </ChartContainer>
            </div>
        </section>
    );
}

function StatItem({ label, value }: { label: string; value: Formatted | undefined }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-medium">
                {value ? (
                    <>
                        <AnimatedNumber value={value.value} />
                        {value.unit && (
                            <span className="ml-0.5 text-xs text-muted-foreground">{value.unit}</span>
                        )}
                    </>
                ) : (
                    <span className="text-muted-foreground">—</span>
                )}
            </span>
        </div>
    );
}
