'use client';

import { AlertTriangle, BarChart3, Clock3, Gauge, GitBranch, Layers3, Zap, type LucideIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useStatsDaily, useStatsObservability, useStatsToday, useStatsTotal } from '@/api/endpoints/stats';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, formatCount, formatTime } from '@/lib/utils';

function compactCount(value: number | undefined) {
    const formatted = formatCount(value ?? 0).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function compactTime(value: number | undefined) {
    const formatted = formatTime(value ?? 0).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function percent(value: number | undefined) {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function sumRequests(items: Array<{ request_count: { raw: number } }>) {
    return items.reduce((sum, item) => sum + item.request_count.raw, 0);
}

function growthDelta(current: number, previous: number) {
    if (previous <= 0) {
        if (current <= 0) return 0;
        return 100;
    }
    return ((current - previous) / previous) * 100;
}



function InsightTile({
    icon: Icon,
    label,
    value,
    detail,
    tone = 'default',
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    detail: string;
    tone?: 'default' | 'warning';
}) {
    return (
        <div
            className={cn(
                'fluent-card flex items-center gap-4 px-5 py-4',
                tone === 'warning' ? 'bg-amber-50' : 'bg-background'
            )}
        >
            <div className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-[16px]',
                tone === 'warning' ? 'bg-amber-500 text-white shadow-sm' : 'bg-primary/10 text-primary shadow-sm'
            )}>
                <Icon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn("text-xl font-black tabular-nums tracking-tight", tone === 'warning' ? 'text-amber-600' : 'text-primary')}>{value}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[13px] font-bold text-muted-foreground">{label}</span>
                    <span className="text-[11px] font-semibold text-muted-foreground/70 truncate">&middot; {detail}</span>
                </div>
            </div>
        </div>
    );
}

export function DashboardSummaryCards() {
    const t = useTranslations('home.dashboard');
    const observabilityT = useTranslations('home.observability');
    const { data: total } = useStatsTotal();
    const { data: today } = useStatsToday();
    const { data: daily } = useStatsDaily();
    const { data: observability } = useStatsObservability('24h');

    const dailyWindows = useMemo(() => {
        const sorted = [...(daily ?? [])].sort((a, b) => a.date.localeCompare(b.date));
        const last7 = sorted.slice(-7);
        const previous7 = sorted.slice(-14, -7);
        const last30 = sorted.slice(-30);

        return {
            last7Requests: sumRequests(last7),
            previous7Requests: sumRequests(previous7),
            last30Requests: sumRequests(last30),
        };
    }, [daily]);

    const todayRequests = (today?.request_success ?? 0) + (today?.request_failed ?? 0);
    const tokenTotal = (observability?.input_tokens ?? 0) + (observability?.output_tokens ?? 0) + (observability?.cache_tokens ?? 0);
    const failureCount = observability?.failed_requests ?? 0;
    const failoverCount = observability?.failover_requests ?? 0;
    const successRateValue = Math.max(0, Math.min(100, (observability?.success_rate ?? 0) * 100));
    const weeklyGrowth = growthDelta(dailyWindows.last7Requests, dailyWindows.previous7Requests);
    const growthPositive = weeklyGrowth >= 0;
    const latencyFormatted = compactTime(observability?.avg_latency_ms);
    const ttfbFormatted = compactTime(observability?.avg_ttfb_ms);

    return (
        <section className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
                {/* Card 1: Total Requests */}
                <article className="fluent-card relative overflow-hidden px-6 py-5 flex flex-col justify-between min-h-[10.5rem]">
                    <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                        <BarChart3 className="size-4.5" />
                        {t('totalRequests')}
                    </div>
                    <div className="mt-4 mb-6">
                        <div className="text-4xl font-black tabular-nums tracking-tight text-foreground drop-shadow-sm">
                            {total?.request_count.formatted.value ?? '0'}
                            <span className="text-2xl ml-0.5">{total?.request_count.formatted.unit ?? ''}</span>
                        </div>
                    </div>
                    <div className="flex items-center mt-auto">
                        <Badge
                            variant="outline"
                            className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs border-none font-bold',
                                growthPositive
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-destructive/10 text-destructive',
                            )}
                        >
                            {growthPositive ? '+' : ''}
                            {weeklyGrowth.toFixed(0)}% {t('comparePrevWeek')}
                        </Badge>
                    </div>
                </article>

                {/* Card 2: Success Rate */}
                <article className="fluent-card relative overflow-hidden px-6 py-5 flex flex-col justify-between min-h-[10.5rem]">
                    <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                        <Gauge className="size-4.5" />
                        {t('successRate')}
                    </div>
                    <div className="mt-4 mb-4">
                        <div className="text-4xl font-black tabular-nums tracking-tight text-foreground drop-shadow-sm">
                            {percent(observability?.success_rate)}
                        </div>
                    </div>
                    <div className="mt-auto space-y-2">
                        <Progress value={successRateValue} className="h-1.5 bg-muted" />
                        <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                            <span>{compactCount(failureCount)} {t('failureRequests')}</span>
                            <span>{observabilityT('range24h')}</span>
                        </div>
                    </div>
                </article>

                {/* Card 3: Tokens */}
                <article className="fluent-card relative overflow-hidden px-6 py-5 flex flex-col justify-between min-h-[10.5rem]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                            <Layers3 className="size-4.5" />
                            {t('tokens')}
                        </div>
                        <Badge variant="outline" className="rounded-full bg-muted/50 text-[10px] font-bold border-none px-2">{observabilityT('range24h')}</Badge>
                    </div>
                    <div className="mt-auto pt-6 flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[11px] font-bold text-muted-foreground">{observabilityT('input')}</span>
                            <span className="text-xl font-black tabular-nums tracking-tight text-foreground truncate">{compactCount(observability?.input_tokens)}</span>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[11px] font-bold text-muted-foreground">{observabilityT('output')}</span>
                            <span className="text-xl font-black tabular-nums tracking-tight text-foreground truncate">{compactCount(observability?.output_tokens)}</span>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[11px] font-bold text-muted-foreground">{observabilityT('cache')}</span>
                            <span className="text-xl font-black tabular-nums tracking-tight text-foreground truncate">{compactCount(observability?.cache_tokens)}</span>
                        </div>
                    </div>
                </article>

                {/* Card 4: Today Requests */}
                <article className="fluent-card bg-primary text-primary-foreground border-none shadow-md relative overflow-hidden px-6 py-5 flex flex-col justify-between min-h-[10.5rem]">
                    <div className="flex items-center gap-2 text-sm font-bold text-primary-foreground/90">
                        <Zap className="size-4.5" />
                        {t('todayRequests')}
                    </div>
                    <div className="mt-4 mb-6">
                        <div className="text-4xl font-black tabular-nums tracking-tight text-white drop-shadow-sm">
                            {compactCount(todayRequests)}
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold text-primary-foreground/80 mt-auto pt-2">
                        <span>{t('weekTotal')}: {compactCount(dailyWindows.last7Requests)}</span>
                        <span>{t('monthTotal')}: {compactCount(dailyWindows.last30Requests)}</span>
                    </div>
                </article>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <InsightTile
                    icon={AlertTriangle}
                    label={t('failureRequests')}
                    value={compactCount(failureCount)}
                    detail={t('failureSub', { total: observability?.total_requests ?? 0 })}
                    tone={failureCount > 0 ? 'warning' : 'default'}
                />
                <InsightTile
                    icon={GitBranch}
                    label={t('failoverRequests')}
                    value={compactCount(failoverCount)}
                    detail={t('failoverSub', { rate: percent(observability?.failover_rate) })}
                    tone={failoverCount > 0 ? 'warning' : 'default'}
                />
                <InsightTile
                    icon={Clock3}
                    label={t('avgLatency')}
                    value={latencyFormatted}
                    detail={t('latencySub', { ttfb: ttfbFormatted })}
                />
            </div>
        </section>
    );
}
