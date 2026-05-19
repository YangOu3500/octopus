'use client';

import { AlertTriangle, BarChart3, Clock3, Gauge, GitBranch, Layers3, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
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

function PrimaryCard({
    icon: Icon,
    title,
    value,
    badge,
    footer,
    children,
    accent = false,
}: {
    icon: LucideIcon;
    title: string;
    value: string;
    badge?: ReactNode;
    footer?: ReactNode;
    children?: ReactNode;
    accent?: boolean;
}) {
    return (
        <article
            className={cn(
                'group relative overflow-hidden rounded-lg border px-5 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                accent
                    ? 'border-primary/70 bg-primary text-primary-foreground'
                    : 'border-border/70 bg-card/95 text-card-foreground hover:border-primary/20',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div
                    className={cn(
                        'flex size-9 items-center justify-center rounded-md border',
                        accent
                            ? 'border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground'
                            : 'border-primary/15 bg-primary/10 text-primary',
                    )}
                >
                    <Icon className="size-3.5" />
                </div>
                {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>

            <div className="mt-4 text-sm font-medium opacity-90">{title}</div>
            <div className="mt-2 text-[2.05rem] font-semibold leading-none tabular-nums tracking-normal sm:text-[2.15rem]">{value}</div>

            {children ? <div className="mt-3">{children}</div> : null}
            {footer ? (
                <div
                    className={cn(
                        'mt-4 border-t pt-3 text-xs',
                        accent ? 'border-primary-foreground/12 text-primary-foreground/75' : 'border-border/70 text-muted-foreground',
                    )}
                >
                    {footer}
                </div>
            ) : null}

            {!accent ? (
                <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            ) : (
                <div className="pointer-events-none absolute right-5 top-5 size-3 rounded-full bg-primary-foreground/15" />
            )}
        </article>
    );
}

function SecondaryCard({
    icon: Icon,
    title,
    value,
    sub,
    tone = 'default',
}: {
    icon: LucideIcon;
    title: string;
    value: string;
    sub: string;
    tone?: 'default' | 'warning';
}) {
    return (
        <div
            className={cn(
                'rounded-lg border bg-card/95 px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md',
                tone === 'warning' ? 'border-amber-500/25 bg-amber-500/5 hover:border-amber-500/35' : 'border-border/70 hover:border-primary/20',
            )}
        >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className={cn('size-3.5', tone === 'warning' && 'text-amber-600 dark:text-amber-400')} />
                <span>{title}</span>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
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

    const growthBadge = (
        <Badge
            variant="outline"
            className={cn(
                'h-7 rounded-full px-2.5 text-xs font-medium',
                growthPositive
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-destructive/20 bg-destructive/10 text-destructive',
            )}
        >
            {growthPositive ? '+' : ''}
            {weeklyGrowth.toFixed(0)}%
        </Badge>
    );

    return (
        <section className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <PrimaryCard
                    icon={BarChart3}
                    title={t('totalRequests')}
                    value={`${total?.request_count.formatted.value ?? '0'}${total?.request_count.formatted.unit ?? ''}`}
                    badge={growthBadge}
                    footer={
                        <div className="flex flex-wrap items-center gap-2">
                            <span>{t('comparePrevWeek')}</span>
                            <span className="font-medium text-foreground">{compactCount(dailyWindows.last7Requests)}</span>
                            <span>/</span>
                            <span>{compactCount(dailyWindows.previous7Requests)}</span>
                        </div>
                    }
                >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="size-3.5 text-primary" />
                        <span>{t('totalSub', { failed: failureCount })}</span>
                    </div>
                </PrimaryCard>

                <PrimaryCard
                    icon={Gauge}
                    title={t('successRate')}
                    value={percent(observability?.success_rate)}
                    badge={
                        <Badge variant="outline" className="h-7 rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {observabilityT('range24h')}
                        </Badge>
                    }
                    footer={
                        <div className="flex items-center justify-between gap-3">
                            <span>{t('successSub', { failed: failureCount })}</span>
                            <span className="font-medium text-foreground">{observability?.success_requests ?? 0}</span>
                        </div>
                    }
                >
                    <div className="space-y-2">
                        <Progress value={successRateValue} className="h-2 bg-muted/80" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{t('failureRequests')}</span>
                            <span className="font-medium text-foreground">{compactCount(failureCount)}</span>
                        </div>
                    </div>
                </PrimaryCard>

                <PrimaryCard
                    icon={Layers3}
                    title={t('tokens')}
                    value={compactCount(tokenTotal)}
                    badge={
                        <Badge variant="outline" className="h-7 rounded-full px-2.5 text-xs font-medium">
                            {observabilityT('range24h')}
                        </Badge>
                    }
                    footer={<span>{t('tokenSub', {
                        input: compactCount(observability?.input_tokens),
                        output: compactCount(observability?.output_tokens),
                        cache: compactCount(observability?.cache_tokens),
                    })}</span>}
                >
                    <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                        <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
                            <div className="text-muted-foreground">{observabilityT('input')}</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">{compactCount(observability?.input_tokens)}</div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
                            <div className="text-muted-foreground">{observabilityT('output')}</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">{compactCount(observability?.output_tokens)}</div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
                            <div className="text-muted-foreground">{observabilityT('cache')}</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">{compactCount(observability?.cache_tokens)}</div>
                        </div>
                    </div>
                </PrimaryCard>

                <PrimaryCard
                    icon={Zap}
                    title={t('todayRequests')}
                    value={compactCount(todayRequests)}
                    accent
                    footer={
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-primary-foreground/65">{t('weekTotal')}</div>
                                <div className="mt-1 font-medium text-primary-foreground">{compactCount(dailyWindows.last7Requests)}</div>
                            </div>
                            <div>
                                <div className="text-primary-foreground/65">{t('monthTotal')}</div>
                                <div className="mt-1 font-medium text-primary-foreground">{compactCount(dailyWindows.last30Requests)}</div>
                            </div>
                        </div>
                    }
                >
                    <div className="flex items-center justify-between gap-3 text-xs text-primary-foreground/75">
                        <span>{t('todaySub', { rpm: (observability?.rpm ?? 0).toFixed(2) })}</span>
                        <span className="inline-flex size-2.5 rounded-full bg-primary-foreground/25" />
                    </div>
                </PrimaryCard>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <SecondaryCard
                    icon={AlertTriangle}
                    title={t('failureRequests')}
                    value={compactCount(failureCount)}
                    sub={t('failureSub', { total: observability?.total_requests ?? 0 })}
                    tone={failureCount > 0 ? 'warning' : 'default'}
                />
                <SecondaryCard
                    icon={GitBranch}
                    title={t('failoverRequests')}
                    value={compactCount(failoverCount)}
                    sub={t('failoverSub', { rate: percent(observability?.failover_rate) })}
                    tone={failoverCount > 0 ? 'warning' : 'default'}
                />
                <SecondaryCard
                    icon={Clock3}
                    title={t('avgLatency')}
                    value={compactTime(observability?.avg_latency_ms)}
                    sub={t('latencySub', { ttfb: compactTime(observability?.avg_ttfb_ms) })}
                />
            </div>
        </section>
    );
}
