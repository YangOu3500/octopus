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
                'fluent-card flex min-h-[10.5rem] flex-col px-5 py-4',
                accent && 'bg-primary text-white shadow-md border-none ring-0'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className={cn(
                    'flex size-11 items-center justify-center rounded-[16px]',
                    accent ? 'bg-white/20 text-white shadow-sm' : 'bg-background/80 text-primary shadow-sm'
                )}>
                    <Icon className="size-5" />
                </div>
                {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>
            <div className={cn("mt-3 text-[13px] font-black tracking-wide uppercase", accent ? "text-white/80" : "text-muted-foreground")}>{title}</div>
            <div className={cn("mt-1 text-3xl font-black leading-none tabular-nums tracking-tight drop-shadow-sm", accent ? "text-white" : "text-primary")}>{value}</div>
            <div className={cn("mt-1.5 line-clamp-1 text-[13px] font-semibold", accent ? "text-white/70" : "text-muted-foreground/80")}>{detail}</div>
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
                        <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                            <div className="bg-background/40 rounded-[16px] px-3 py-2.5">
                                <div className="text-muted-foreground font-bold">{t('todayRequests')}</div>
                                <div className="mt-1 font-black text-foreground text-sm">{compactCount(todayRequests)}</div>
                            </div>
                            <div className="bg-background/40 rounded-[16px] px-3 py-2.5">
                                <div className="text-muted-foreground font-bold">{t('weekTotal')}</div>
                                <div className="mt-1 font-black text-foreground text-sm">{compactCount(dailyWindows.last7Requests)}</div>
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
                        <div className="space-y-1.5">
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
                        <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                            <div className="bg-background/40 rounded-[12px] px-2.5 py-2.5">
                                <div className="text-muted-foreground font-bold">{observabilityT('input')}</div>
                                <div className="mt-1 font-black text-foreground">{compactCount(observability?.input_tokens)}</div>
                            </div>
                            <div className="bg-background/40 rounded-[12px] px-2.5 py-2.5">
                                <div className="text-muted-foreground font-bold">{observabilityT('output')}</div>
                                <div className="mt-1 font-black text-foreground">{compactCount(observability?.output_tokens)}</div>
                            </div>
                            <div className="bg-background/40 rounded-[12px] px-2.5 py-2.5">
                                <div className="text-muted-foreground font-bold">{observabilityT('cache')}</div>
                                <div className="mt-1 font-black text-foreground">{compactCount(observability?.cache_tokens)}</div>
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
                        <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                            <div className="bg-background/40 rounded-[16px] text-primary px-3 py-2.5">
                                <div className="font-bold text-muted-foreground">{t('monthTotal')}</div>
                                <div className="mt-1 font-black text-sm">{compactCount(dailyWindows.last30Requests)}</div>
                            </div>
                            <div className="bg-background/40 rounded-[16px] text-primary px-3 py-2.5">
                                <div className="font-bold text-muted-foreground">{observabilityT('range24h')}</div>
                                <div className="mt-1 font-black text-sm">{latencyFormatted}</div>
                            </div>
                        </div>
                    )}
                />
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
