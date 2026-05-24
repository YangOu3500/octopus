'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { useHomeViewStore, type ChartPeriod } from './store';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useStatsDaily, useStatsObservability, useStatsTotal } from '@/api/endpoints/stats';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCount, formatMoney, formatTime } from '@/lib/utils';

type Formatted = {
    value: string;
    unit: string;
};

const PERIOD_KEY: Record<ChartPeriod, string> = {
    '1': 'today',
    '7': 'last7Days',
    '30': 'last30Days',
    'all': 'allTime',
};

const chartConfig = {
    tokens: {
        label: 'Tokens',
        color: 'hsl(var(--primary))',
    },
    requests: {
        label: 'Requests',
        color: 'hsl(var(--muted-foreground) / 0.7)',
    },
    total_cost: {
        label: 'Cost',
        color: 'hsl(var(--primary) / 0.5)',
    },
};

export function StatsChart({ className }: { className?: string }) {
    const t = useTranslations('home.summary');
    const period = useHomeViewStore((state) => state.chartPeriod);
    const setChartPeriod = useHomeViewStore((state) => state.setChartPeriod);

    const { data: total } = useStatsTotal();
    const { data: daily = [] } = useStatsDaily();
    const { data: observability } = useStatsObservability('24h');

    const hero = useMemo<Formatted | undefined>(() => {
        if (period === '1') {
            return observability?.total_attempt_cost ? formatMoney(observability.total_attempt_cost).formatted : undefined;
        }
        if (period === '7') {
            const last7 = daily.slice(-7);
            const sum = last7.reduce((acc, curr) => acc + curr.total_cost.raw, 0);
            return formatMoney(sum).formatted;
        }
        if (period === '30') {
            const last30 = daily.slice(-30);
            const sum = last30.reduce((acc, curr) => acc + curr.total_cost.raw, 0);
            return formatMoney(sum).formatted;
        }
        return total?.total_cost.formatted;
    }, [period, daily, observability, total]);

    const metrics = useMemo(() => {
        let requests = 0;
        let tokens = 0;
        let waitTime = 0;

        if (period === '1') {
            requests = observability?.total_requests ?? 0;
            tokens = (observability?.input_tokens ?? 0) + (observability?.output_tokens ?? 0);
            waitTime = observability?.avg_latency_ms ?? 0;
        } else {
            const count = period === '7' ? 7 : period === '30' ? 30 : daily.length;
            const items = daily.slice(-count);
            requests = items.reduce((acc, curr) => acc + curr.request_count.raw, 0);
            tokens = items.reduce((acc, curr) => acc + curr.total_token.raw, 0);
            const totalWait = items.reduce((acc, curr) => acc + curr.wait_time.raw, 0);
            waitTime = items.length > 0 ? totalWait / items.length : 0;
        }

        return {
            requests: formatCount(requests).formatted,
            tokens: formatCount(tokens).formatted,
            waitTime: formatTime(waitTime).formatted,
        };
    }, [period, daily, observability]);

    const chartData = useMemo(() => {
        const count = period === '1' ? 24 : period === '7' ? 7 : period === '30' ? 30 : daily.length;
        const items = daily.slice(-count);

        return items.map(item => ({
            date: item.date.length === 8 ? `${item.date.slice(4, 6)}/${item.date.slice(6, 8)}` : item.date,
            tokens: item.total_token.raw,
            requests: item.request_count.raw,
            total_cost: item.total_cost.raw,
        }));
    }, [period, daily]);

    const heroUnitSuffix = useMemo(() => {
        if (!hero?.unit) return '';
        if (hero.unit === '$') return '';
        return hero.unit.replace(/\$$/, '');
    }, [hero]);

    return (
        <section className={cn("rounded-xl border border-border bg-card flex flex-col shadow-2xs", className)}>
            {/* Header: hero + tabs */}
            <header className="flex flex-col gap-3 px-6 pb-3 pt-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">{t(`headline.${PERIOD_KEY[period]}`)}</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums md:text-4xl text-foreground">
                        {hero?.value === undefined ? (
                            <span className="text-muted-foreground">—</span>
                        ) : (
                            <>
                                <span className="mr-1 text-lg font-bold text-muted-foreground">$</span>
                                <span>{hero.value}</span>
                                {heroUnitSuffix && (
                                    <span className="ml-1 text-base font-semibold text-muted-foreground/80">{heroUnitSuffix}</span>
                                )}
                            </>
                        )}
                    </p>
                </div>
                <Tabs value={period} onValueChange={(v) => setChartPeriod(v as ChartPeriod)}>
                    <TabsList className="bg-muted p-0.5 rounded-lg border border-border/30 h-8">
                        <TabsTrigger value="1" className="text-xs py-1 rounded-md">{t('periods.today')}</TabsTrigger>
                        <TabsTrigger value="7" className="text-xs py-1 rounded-md">{t('periods.last7Days')}</TabsTrigger>
                        <TabsTrigger value="30" className="text-xs py-1 rounded-md">{t('periods.last30Days')}</TabsTrigger>
                        <TabsTrigger value="all" className="text-xs py-1 rounded-md">{t('periods.allTime')}</TabsTrigger>
                    </TabsList>
                </Tabs>
            </header>

            {/* Metrics row */}
            <div className="mx-6 flex flex-wrap items-baseline gap-5 border-t border-border/30 py-3 text-xs font-semibold uppercase tracking-wider tabular-nums text-muted-foreground">
                <StatItem label={t('metrics.requests')} value={metrics.requests} />
                <span className="h-3.5 w-px bg-border/20" />
                <StatItem label={t('metrics.tokens')} value={metrics.tokens} />
                <span className="h-3.5 w-px bg-border/20" />
                <StatItem label={t('metrics.waitTime')} value={metrics.waitTime} />
            </div>

            {/* Area chart */}
            <div className="mx-6 mb-5 p-3 rounded-xl flex-1 flex flex-col min-h-[300px] border border-border/50 bg-background/20">
                <ChartContainer config={chartConfig} className="h-full w-full flex-1 px-1">
                    <AreaChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-total_cost)" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="var(--color-total_cost)" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                        <XAxis 
                            dataKey="date" 
                            tickLine={false} 
                            axisLine={false} 
                            tickMargin={8} 
                            stroke="hsl(var(--foreground) / 0.55)"
                            className="text-[10px] font-semibold tracking-wider font-mono"
                        />
                        <YAxis
                            yAxisId="left"
                            orientation="left"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            stroke="hsl(var(--foreground) / 0.55)"
                            className="text-[10px] font-semibold tracking-wider font-mono"
                            tickFormatter={(value) => formatCount(value).formatted.value + formatCount(value).formatted.unit}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            stroke="hsl(var(--foreground) / 0.55)"
                            className="text-[10px] font-semibold tracking-wider font-mono"
                            tickFormatter={(value) => {
                                const formatted = formatMoney(value);
                                return `$${formatted.formatted.value}${formatted.formatted.unit.replace('$', '')}`;
                            }}
                        />
                        <ChartTooltip cursor={{ stroke: 'hsl(var(--border) / 0.3)', strokeWidth: 1 }} content={<ChartTooltipContent indicator="line" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="tokens"
                            stroke="var(--color-tokens)"
                            strokeWidth={1.5}
                            fill="url(#fillTokens)"
                        />
                        <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="requests"
                            stroke="var(--color-requests)"
                            strokeWidth={1.5}
                            fill="url(#fillRequests)"
                        />
                        <Area
                            yAxisId="right"
                            type="monotone"
                            dataKey="total_cost"
                            stroke="var(--color-total_cost)"
                            strokeWidth={1.5}
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
            <span className="font-semibold text-foreground">
                {value ? (
                    <>
                        <span>{value.value.toLocaleString()}</span>
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
