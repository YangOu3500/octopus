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

function SummaryCard({
    icon: Icon,
    title,
    value,
    detail,
    badge,
    accent,
    extra,
}: {
    icon: LucideIcon;
    title: string;
    value: string;
    detail: string;
    badge?: ReactNode;
    accent?: boolean;
    extra?: ReactNode;
}) {
    return (
        <article
            className={cn(
                'flex h-full min-h-[13.5rem] flex-col rounded-2xl border px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md',
                accent
                    ? 'border-primary/20 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-card'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className={cn(
                    'flex size-9 items-center justify-center rounded-lg border',
                    accent ? 'border-primary/20 bg-background text-primary' : 'border-border/70 bg-background/70 text-primary'
                )}>
                    <Icon className="size-4" />
                </div>
                {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>
            <div className="mt-4 text-xs text-muted-foreground">{title}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
            {extra ? <div className="mt-auto pt-3">{extra}</div> : null}
        </article>
    );
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
                'rounded-xl border px-3 py-2.5 transition-all duration-200 hover:-translate-y-px hover:shadow-sm',
                tone === 'warning'
                    ? 'border-amber-500/25 bg-amber-500/5'
                    : 'border-border/70 bg-background/40'
            )}
        >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                <span>{label}</span>
            </div>
            <div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
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

    return (
        <section className="space-y-3">
            <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    icon={BarChart3}
                    title={t('totalRequests')}
                    value={`${total?.request_count.formatted.value ?? '0'}${total?.request_count.formatted.unit ?? ''}`}
                    detail={t('comparePrevWeek')}
                    badge={(
                        <Badge
                            variant="outline"
                            className={cn(
                                'rounded-md px-2 text-[11px]',
                                growthPositive
                                    ? 'border-primary/20 bg-primary/10 text-primary'
                                    : 'border-destructive/20 bg-destructive/10 text-destructive',
                            )}
                        >
                            {growthPositive ? '+' : ''}
                            {weeklyGrowth.toFixed(0)}%
                        </Badge>
                    )}
                    extra={(
                        <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                            <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                                <div className="text-muted-foreground">{t('todayRequests')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(todayRequests)}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                                <div className="text-muted-foreground">{t('weekTotal')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(dailyWindows.last7Requests)}</div>
                            </div>
                        </div>
                    )}
                />

                <SummaryCard
                    icon={Gauge}
                    title={t('successRate')}
                    value={percent(observability?.success_rate)}
                    detail={t('successSub', { failed: failureCount })}
                    badge={<Badge variant="outline" className="rounded-md px-2 text-[11px]">{observabilityT('range24h')}</Badge>}
                    extra={(
                        <div className="space-y-2">
                            <Progress value={successRateValue} className="h-2 bg-muted/80" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t('failureRequests')}</span>
                                <span className="font-medium text-foreground">{compactCount(failureCount)}</span>
                            </div>
                        </div>
                    )}
                />

                <SummaryCard
                    icon={Layers3}
                    title={t('tokens')}
                    value={compactCount(tokenTotal)}
                    detail={t('tokenSub', {
                        input: compactCount(observability?.input_tokens),
                        output: compactCount(observability?.output_tokens),
                        cache: compactCount(observability?.cache_tokens),
                    })}
                    badge={<Badge variant="outline" className="rounded-md px-2 text-[11px]">{observabilityT('range24h')}</Badge>}
                    extra={(
                        <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                                <div className="text-muted-foreground">{observabilityT('input')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(observability?.input_tokens)}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                                <div className="text-muted-foreground">{observabilityT('output')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(observability?.output_tokens)}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                                <div className="text-muted-foreground">{observabilityT('cache')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(observability?.cache_tokens)}</div>
                            </div>
                        </div>
                    )}
                />

                <SummaryCard
                    icon={Zap}
                    title={t('todayRequests')}
                    value={compactCount(todayRequests)}
                    detail={t('todaySub', { rpm: (observability?.rpm ?? 0).toFixed(2) })}
                    accent
                    extra={(
                        <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                            <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-2">
                                <div className="text-muted-foreground">{t('monthTotal')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactCount(dailyWindows.last30Requests)}</div>
                            </div>
                            <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-2">
                                <div className="text-muted-foreground">{observabilityT('range24h')}</div>
                                <div className="mt-1 font-medium text-foreground">{compactTime(observability?.avg_latency_ms)}</div>
                            </div>
                        </div>
                    )}
                />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                    value={compactTime(observability?.avg_latency_ms)}
                    detail={t('latencySub', { ttfb: compactTime(observability?.avg_ttfb_ms) })}
                />
            </div>
        </section>
    );
}
