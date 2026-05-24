'use client';

import { useMemo } from 'react';
import { AlertTriangle, Clock3, GitBranch, Sigma } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useStatsObservability, type StatsObservabilityFailure } from '@/api/endpoints/stats';
import { Badge } from '@/components/ui/badge';
import { cn, formatCount, formatMoney, formatTime } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
            'border border-border bg-background/40 rounded-xl px-4 py-4 transition-colors duration-150',
            tone === 'warning' && 'border-amber-500/20 bg-amber-500/5',
            tone === 'danger' && 'border-rose-500/20 bg-rose-500/5',
        )}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
            <div className="mt-1 text-[10px] font-medium text-muted-foreground/80 truncate">{sub}</div>
        </div>
    );
}

function RecentFailureList({ items }: { items: StatsObservabilityFailure[] }) {
    const t = useTranslations('home.observability');
    const displayItems = items.slice(0, 5);

    return (
        <div className="bg-background/20 border border-border rounded-xl p-4 min-w-0 h-full flex flex-col">
            <div className="mb-3 flex items-center gap-2.5 text-xs font-bold text-foreground shrink-0">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <span>{t('recentFailures')}</span>
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[300px] scrollbar-none">
                {displayItems.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-10 text-center">{t('noFailures')}</div>
                ) : displayItems.map((item) => (
                    <Tooltip key={`${item.id}-${item.channel_id}-${item.failure_reason}`}>
                        <TooltipTrigger asChild>
                            <div className="rounded-lg px-3 py-2 transition-all duration-150 hover:bg-muted/40 cursor-help border border-transparent hover:border-border/40 bg-background/10">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Badge variant="outline" className="bg-background/40 h-5 shrink-0 px-1.5 text-[10px]">
                                        {item.http_status || '—'}
                                    </Badge>
                                    <span className="truncate text-xs font-bold text-foreground">
                                        {item.request_model || '—'}
                                    </span>
                                    <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground tabular-nums">
                                        {formatMetricTime(item.duration_ms)}
                                    </span>
                                </div>
                                <div className="mt-1 truncate text-[10px] font-medium text-muted-foreground/85">
                                    {item.channel_name || `#${item.channel_id || 0}`} · {item.failure_reason || t('unknown')}
                                </div>
                                <div className="mt-1 flex min-w-0 items-center gap-2 text-[9px] font-bold tracking-wider uppercase text-muted-foreground/60">
                                    <span className="shrink-0">{formatFailureTime(item.time)}</span>
                                    <span className="truncate">{item.trace_id || `#${item.id}`}</span>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[320px] break-words border border-border bg-popover text-popover-foreground shadow-md p-3">
                            <div className="font-bold text-xs border-b border-border/50 pb-1 mb-1 text-foreground">
                                {item.channel_name || `Channel #${item.channel_id}`}
                            </div>
                            <div className="text-xs leading-relaxed">
                                <span className="font-semibold text-muted-foreground">Reason:</span> {item.failure_reason || t('unknown')}
                            </div>
                            {item.trace_id && (
                                <div className="mt-1.5 text-[9px] font-mono text-muted-foreground/75 border-t border-border/30 pt-1">
                                    Trace: {item.trace_id}
                                </div>
                            )}
                        </TooltipContent>
                    </Tooltip>
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
        if (data.total_attempt_cost === 0) return '—';
        return t('costSub', {
            final: formatMetricMoney(data.final_success_cost),
            failed: formatMetricMoney(data.failed_attempt_cost),
        });
    }, [data, t]);

    const totalRequests = data?.total_requests ?? 0;
    const failoverRequests = data?.failover_requests ?? 0;

    return (
        <TooltipProvider>
            <div className="flex flex-col space-y-4">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{t('description')}</span>
                    </div>
                    <Badge variant={error ? 'destructive' : 'secondary'} className="h-6 px-2.5 font-semibold text-[10px] rounded-md">
                        {error ? t('loadFailed') : isLoading ? t('loading') : t('range24h')}
                    </Badge>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1.2fr] gap-4 items-stretch">
                    {/* Left Column: Metrics & Info Cards */}
                    <div className="space-y-4 flex flex-col justify-between">
                        {/* 4 Metric Tiles */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricTile
                                label={t('requests')}
                                value={formatMetricCount(totalRequests)}
                                sub={totalRequests > 0 ? t('rpmSub', { rpm: (data?.rpm ?? 0).toFixed(2) }) : '—'}
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

                        {/* 3 Info Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Card 1: Tokens */}
                            <div className="rounded-xl border border-border bg-background/40 p-4 flex flex-col justify-between">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Sigma className="h-4 w-4 text-muted-foreground" />
                                    <span>{t('tokens')}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">{t('input')}</div>
                                        <div className="font-bold mt-0.5 text-foreground">{formatMetricCount(data?.input_tokens)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">{t('output')}</div>
                                        <div className="font-bold mt-0.5 text-foreground">{formatMetricCount(data?.output_tokens)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">{t('cache')}</div>
                                        <div className="font-bold mt-0.5 text-foreground">{formatMetricCount(data?.cache_tokens)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Window with Tooltip */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="rounded-xl border border-border bg-background/40 p-4 cursor-help hover:bg-muted/10 transition-colors flex flex-col justify-between">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-foreground">
                                            <Clock3 className="h-4 w-4 text-muted-foreground" />
                                            <span>{t('window')}</span>
                                        </div>
                                        <div className="text-xs text-foreground font-semibold mt-1">
                                            {t('range24h')}
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="border border-border bg-popover text-popover-foreground shadow-md p-2">
                                    <div className="text-xs font-mono font-semibold">
                                        {data ? `${formatFailureTime(data.start_time)} - ${formatFailureTime(data.end_time)}` : t('loading')}
                                    </div>
                                </TooltipContent>
                            </Tooltip>

                            {/* Card 3: Chain */}
                            <div className="rounded-xl border border-border bg-background/40 p-4 flex flex-col justify-between">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-foreground">
                                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                                    <span>{t('chain')}</span>
                                </div>
                                <div className="text-xs text-muted-foreground leading-relaxed mt-1">
                                    {t('chainSub', {
                                        failover: failoverRequests,
                                        total: totalRequests,
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Recent Failure List */}
                    <div className="min-w-0">
                        <RecentFailureList items={data?.recent_failures ?? []} />
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
