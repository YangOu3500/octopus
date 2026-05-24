'use client';

import { useMemo } from 'react';
import { Activity, AlertTriangle, Clock3, GitBranch, Gauge, Server, Sigma } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useStatsObservability, type StatsObservabilityBreakdown, type StatsObservabilityFailure } from '@/api/endpoints/stats';
import { Badge } from '@/components/ui/badge';
import { cn, formatCount, formatMoney, formatTime } from '@/lib/utils';

function formatPercent(value: number | undefined) {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function formatMetricCount(value: number | undefined) {
    const formatted = formatCount(value).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function formatMetricMoney(value: number | undefined) {
    const formatted = formatMoney(value).formatted;
    if (formatted.unit.endsWith('$')) {
        return `$${formatted.value}${formatted.unit.replace(/\$$/, '')}`;
    }
    return `${formatted.value}${formatted.unit}`;
}

function formatMetricTime(value: number | undefined) {
    const formatted = formatTime(value).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function formatFailureTime(value: number) {
    if (!value) return '—';
    return new Date(value * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function MetricTile({
    label,
    value,
    sub,
    tone = 'default',
}: {
    label: string;
    value: string;
    sub: string;
    tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
    return (
        <div className={cn(
            'bg-background/30 border border-border/20 rounded-[16px] px-4 py-4 transition-all duration-200',
            tone === 'success' && 'text-primary',
            tone === 'warning' && 'text-amber-500',
            tone === 'danger' && 'text-destructive',
        )}>
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-foreground drop-shadow-sm">{value}</div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground/80">{sub}</div>
        </div>
    );
}

function BreakdownList({ title, items }: { title: string; items: StatsObservabilityBreakdown[] }) {
    const t = useTranslations('home.observability');

    return (
        <div className="bg-background/30 border border-border/20 rounded-[20px] p-4">
            <div className="mb-3 flex items-center gap-2.5 text-[13px] font-black text-foreground">
                <Server className="size-4 text-muted-foreground" />
                <span>{title}</span>
            </div>
            <div className="space-y-1.5">
                {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('noData')}</div>
                ) : items.map((item) => (
                    <div key={`${item.id ?? item.name}-${item.name}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-[12px] px-3 py-2.5 transition-all duration-200 hover:bg-background/50">
                        <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-foreground" title={item.name}>{item.name || '—'}</div>
                            <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground/80">
                                {t('breakdownMeta', {
                                    requests: item.requests,
                                    failures: item.failures,
                                    rate: formatPercent(item.success_rate),
                                })}
                            </div>
                        </div>
                        <div className="flex flex-col justify-center text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                            <div className="text-foreground/80">{formatMetricTime(item.avg_latency_ms)}</div>
                            <div className="mt-0.5">{formatMetricMoney(item.cost)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RecentFailureList({ items }: { items: StatsObservabilityFailure[] }) {
    const t = useTranslations('home.observability');

    return (
        <div className="bg-background/30 border border-border/20 rounded-[20px] p-4">
            <div className="mb-3 flex items-center gap-2.5 text-[13px] font-black text-foreground">
                <AlertTriangle className="size-4 text-destructive" />
                <span>{t('recentFailures')}</span>
            </div>
            <div className="space-y-1.5">
                {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('noFailures')}</div>
                ) : items.map((item) => (
                    <div key={`${item.id}-${item.channel_id}-${item.failure_reason}`} className="rounded-[12px] px-3 py-2.5 transition-all duration-200 hover:bg-background/50">
                        <div className="flex min-w-0 items-center gap-2">
                            <Badge variant="outline" className="bg-background/40 border-none h-5 shrink-0 px-1.5 text-[10px]">
                                {item.http_status || '—'}
                            </Badge>
                            <span className="truncate text-[13px] font-bold text-foreground" title={item.request_model}>
                                {item.request_model || '—'}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
                                {formatMetricTime(item.duration_ms)}
                            </span>
                        </div>
                        <div className="mt-1 truncate text-[11px] font-medium text-muted-foreground/80" title={item.failure_reason || undefined}>
                            {item.channel_name || `#${item.channel_id || 0}`} · {item.failure_reason || t('unknown')}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60">
                            <span className="shrink-0">{formatFailureTime(item.time)}</span>
                            <span className="truncate">{item.trace_id || `#${item.id}`}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ObservabilityPanel() {
    const t = useTranslations('home.observability');
    const { data, isLoading, error } = useStatsObservability('24h');

    const costSub = useMemo(() => {
        if (!data) return t('loading');
        return t('costSub', {
            final: formatMetricMoney(data.final_success_cost),
            failed: formatMetricMoney(data.failed_attempt_cost),
        });
    }, [data, t]);

    const totalRequests = data?.total_requests ?? 0;
    const failedRequests = data?.failed_requests ?? 0;
    const failoverRequests = data?.failover_requests ?? 0;

    return (
        <div className="flex flex-col h-full">
            <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="hidden md:block">
                    <p className="text-[13px] font-medium text-muted-foreground/80">{t('description')}</p>
                </div>
                <Badge variant={error ? 'outline' : 'secondary'} className={cn('fluent-pressed border-none w-fit h-7 px-3 rounded-lg font-bold text-[11px]', error && 'text-destructive')}>
                    {error ? t('loadFailed') : isLoading ? t('loading') : t('range24h')}
                </Badge>
            </header>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <MetricTile
                    label={t('successRate')}
                    value={formatPercent(data?.success_rate)}
                    sub={t('successSub', { success: data?.success_requests ?? 0, failed: failedRequests })}
                    tone={failedRequests > 0 ? 'warning' : 'success'}
                />
                <MetricTile
                    label={t('requests')}
                    value={formatMetricCount(totalRequests)}
                    sub={t('rpmSub', { rpm: (data?.rpm ?? 0).toFixed(2) })}
                />
                <MetricTile
                    label={t('failover')}
                    value={formatMetricCount(failoverRequests)}
                    sub={formatPercent(data?.failover_rate)}
                    tone={failoverRequests > 0 ? 'warning' : 'default'}
                />
                <MetricTile
                    label={t('latency')}
                    value={formatMetricTime(data?.avg_latency_ms)}
                    sub={t('ttfbSub', { ttfb: formatMetricTime(data?.avg_ttfb_ms) })}
                />
                <MetricTile
                    label={t('cost')}
                    value={formatMetricMoney(data?.total_attempt_cost)}
                    sub={costSub}
                    tone={(data?.failed_attempt_cost ?? 0) > 0 ? 'warning' : 'default'}
                />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div className="rounded-md border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Sigma className="size-4 text-muted-foreground" />
                        <span>{t('tokens')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                        <div>
                            <div className="text-xs text-muted-foreground">{t('input')}</div>
                            <div className="font-medium">{formatMetricCount(data?.input_tokens)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">{t('output')}</div>
                            <div className="font-medium">{formatMetricCount(data?.output_tokens)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">{t('cache')}</div>
                            <div className="font-medium">{formatMetricCount(data?.cache_tokens)}</div>
                        </div>
                    </div>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Clock3 className="size-4 text-muted-foreground" />
                        <span>{t('window')}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {data ? `${formatFailureTime(data.start_time)} - ${formatFailureTime(data.end_time)}` : t('loading')}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Activity className="size-3.5" />
                        <span>{t('sourceHint')}</span>
                    </div>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <GitBranch className="size-4 text-muted-foreground" />
                        <span>{t('chain')}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {t('chainSub', {
                            failover: failoverRequests,
                            total: totalRequests,
                        })}
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)] 2xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.9fr))]">
                <RecentFailureList items={data?.recent_failures ?? []} />
                <BreakdownList title={t('topChannels')} items={data?.top_channels ?? []} />
                <BreakdownList title={t('topModels')} items={data?.top_models ?? []} />
                <BreakdownList title={t('topApiKeys')} items={data?.top_api_keys ?? []} />
                <BreakdownList title={t('sourceBreakdown')} items={data?.source_breakdown ?? []} />
            </div>
        </div>
    );
}
