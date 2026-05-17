'use client';

import { AlertTriangle, BarChart3, Gauge, GitBranch, Layers3, Zap, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useStatsObservability, useStatsToday, useStatsTotal } from '@/api/endpoints/stats';
import { cn, formatCount } from '@/lib/utils';

function compactCount(value: number | undefined) {
    const formatted = formatCount(value ?? 0).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function percent(value: number | undefined) {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    sub,
    tone = 'default',
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: string;
    tone?: 'default' | 'good' | 'warning' | 'accent';
}) {
    return (
        <article
            className={cn(
                'min-h-28 rounded-lg border bg-card p-4 text-card-foreground shadow-sm',
                tone === 'good' && 'border-emerald-500/25 bg-emerald-500/5',
                tone === 'warning' && 'border-amber-500/25 bg-amber-500/5',
                tone === 'accent' && 'border-primary/30 bg-primary text-primary-foreground',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className={cn(
                    'flex size-9 items-center justify-center rounded-lg border bg-background/60 text-primary',
                    tone === 'accent' && 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground',
                )}>
                    <Icon className="size-4" />
                </div>
            </div>
            <div className="mt-4 text-sm font-medium opacity-90">{label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums tracking-normal">{value}</div>
            <div className={cn(
                'mt-2 text-xs text-muted-foreground',
                tone === 'accent' && 'text-primary-foreground/75',
            )}>
                {sub}
            </div>
        </article>
    );
}

export function DashboardSummaryCards() {
    const t = useTranslations('home.dashboard');
    const { data: total } = useStatsTotal();
    const { data: today } = useStatsToday();
    const { data: observability } = useStatsObservability('24h');

    const todayRequests = (today?.request_success ?? 0) + (today?.request_failed ?? 0);
    const tokenTotal = (observability?.input_tokens ?? 0) + (observability?.output_tokens ?? 0) + (observability?.cache_tokens ?? 0);
    const failureCount = observability?.failed_requests ?? 0;
    const failoverCount = observability?.failover_requests ?? 0;

    return (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard
                icon={BarChart3}
                label={t('totalRequests')}
                value={`${total?.request_count.formatted.value ?? '0'}${total?.request_count.formatted.unit ?? ''}`}
                sub={t('totalSub', { failed: failureCount })}
            />
            <SummaryCard
                icon={Gauge}
                label={t('successRate')}
                value={percent(observability?.success_rate)}
                sub={t('successSub', { failed: failureCount })}
                tone={failureCount > 0 ? 'warning' : 'good'}
            />
            <SummaryCard
                icon={Layers3}
                label={t('tokens')}
                value={compactCount(tokenTotal)}
                sub={t('tokenSub', {
                    input: compactCount(observability?.input_tokens),
                    output: compactCount(observability?.output_tokens),
                    cache: compactCount(observability?.cache_tokens),
                })}
            />
            <SummaryCard
                icon={Zap}
                label={t('todayRequests')}
                value={compactCount(todayRequests)}
                sub={t('todaySub', { rpm: (observability?.rpm ?? 0).toFixed(2) })}
                tone="accent"
            />
            <SummaryCard
                icon={AlertTriangle}
                label={t('failureRequests')}
                value={compactCount(failureCount)}
                sub={t('failureSub', { total: observability?.total_requests ?? 0 })}
                tone={failureCount > 0 ? 'warning' : 'good'}
            />
            <SummaryCard
                icon={GitBranch}
                label={t('failoverRequests')}
                value={compactCount(failoverCount)}
                sub={t('failoverSub', { rate: percent(observability?.failover_rate) })}
                tone={failoverCount > 0 ? 'warning' : 'default'}
            />
        </section>
    );
}
