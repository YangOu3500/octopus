'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    ArrowLeft,
    ArrowRight,
    Database,
    GitBranch,
    Loader2,
    RefreshCw,
    Search,
    ShieldAlert,
    Timer,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    type RequestAttempt,
    type RequestTrace,
    type RequestTraceListParams,
    useRequestTraceDetail,
    useRequestTraces,
} from '@/api/endpoints/traces';
import { useNavStore } from '@/components/modules/navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

function optionalBoolean(value: string): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function nonAll(value: string) {
    return value && value !== 'all' ? value : undefined;
}

function hasNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function formatCount(value: number | null | undefined) {
    return (value ?? 0).toLocaleString();
}

function formatDuration(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(2)}s`;
}

function formatCost(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    return value.toFixed(6);
}

function formatTime(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toLocaleString();
}

function formatTokens(trace: RequestTrace) {
    const input = trace.input_tokens ?? 0;
    const output = trace.output_tokens ?? 0;
    const cache = trace.cache_tokens ?? 0;
    return `${input.toLocaleString()} / ${output.toLocaleString()} / ${cache.toLocaleString()}`;
}

function formatAttemptTokens(attempt: RequestAttempt) {
    const parts = [
        `in ${attempt.input_tokens ?? 0}`,
        `out ${attempt.output_tokens ?? 0}`,
        `cache ${attempt.cache_tokens ?? 0}`,
    ];
    return parts.join(' / ');
}

function statusClass(status: string | undefined) {
    switch ((status ?? '').toLowerCase()) {
        case 'success':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'failed':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        case 'canceled':
            return 'border-muted-foreground/30 bg-muted text-muted-foreground';
        case 'circuit_break':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'skipped':
            return 'border-muted-foreground/30 bg-muted text-muted-foreground';
        default:
            return 'border-border bg-background text-muted-foreground';
    }
}

function streamLabel(stream: boolean | undefined, t: ReturnType<typeof useTranslations<'traces'>>) {
    return stream ? t('stream.stream') : t('stream.nonStream');
}

function sourceLabel(source: string | undefined) {
    switch ((source ?? '').trim()) {
        case 'relay':
            return 'Relay';
        case 'model_test':
            return 'Model Test';
        case 'images':
            return 'Images';
        case 'probe':
            return 'Probe';
        default:
            return source?.trim() || '-';
    }
}

function protocolPath(attempt: RequestAttempt) {
    const parts = [attempt.request_protocol, attempt.upstream_protocol, attempt.response_protocol]
        .map((item) => item?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' -> ') : '-';
}

function SummaryTile({
    label,
    value,
    sub,
    icon: Icon,
}: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
}) {
    return (
        <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs text-muted-foreground">{label}</div>
                <Icon className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground" title={sub}>{sub}</div>
        </div>
    );
}

function TraceTable({
    items,
    selectedTraceId,
    onSelect,
}: {
    items: RequestTrace[];
    selectedTraceId: string | null;
    onSelect: (traceId: string) => void;
}) {
    const t = useTranslations('traces');

    return (
        <div className="min-h-0 overflow-auto rounded-lg border bg-card">
            <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-muted/70 text-muted-foreground backdrop-blur">
                    <tr>
                        <th className="px-3 py-2 font-medium">{t('table.request')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.status')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.route')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.attempts')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.latency')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.tokens')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.cost')}</th>
                        <th className="px-3 py-2 font-medium">{t('table.time')}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((trace) => {
                        const active = trace.trace_id === selectedTraceId;
                        return (
                            <tr
                                key={trace.trace_id || trace.id}
                                className={cn(
                                    'cursor-pointer border-b last:border-0 hover:bg-primary/5',
                                    active && 'bg-primary/10',
                                )}
                                onClick={() => onSelect(trace.trace_id)}
                            >
                                <td className="max-w-[260px] px-3 py-3">
                                    <div className="truncate font-medium" title={trace.client_model}>{trace.client_model || '-'}</div>
                                    <div className="mt-1 flex min-w-0 items-center gap-2">
                                        <span className="truncate font-mono text-[11px] text-muted-foreground" title={trace.trace_id}>
                                            {trace.trace_id}
                                        </span>
                                        <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                                            {sourceLabel(trace.request_source)}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[11px]', statusClass(trace.final_status))}>
                                        {trace.final_status || '-'}
                                    </Badge>
                                    <div className="mt-1 text-muted-foreground">{streamLabel(trace.request_stream, t)}</div>
                                </td>
                                <td className="max-w-[250px] px-3 py-3">
                                    <div className="truncate" title={trace.final_upstream_model || undefined}>
                                        {trace.final_upstream_model || '-'}
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                        {t('ids.channelSite', {
                                            channel: trace.final_channel_id || 0,
                                            site: trace.final_site_id || 0,
                                        })}
                                    </div>
                                </td>
                                <td className="px-3 py-3 tabular-nums">
                                    <div className="font-medium">{trace.attempts_count || 0}</div>
                                    <div className="text-muted-foreground">
                                        {(trace.attempts_count || 0) > 1 ? t('failover.yes') : t('failover.no')}
                                    </div>
                                </td>
                                <td className="px-3 py-3 tabular-nums">
                                    {formatDuration(trace.total_latency_ms)}
                                </td>
                                <td className="px-3 py-3 font-mono tabular-nums">
                                    {formatTokens(trace)}
                                </td>
                                <td className="px-3 py-3 font-mono tabular-nums">
                                    {formatCost(trace.total_attempt_cost || trace.estimated_cost)}
                                </td>
                                <td className="px-3 py-3 tabular-nums">
                                    {formatTime(trace.created_at)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function TraceDetailPanel({ traceId }: { traceId: string | null }) {
    const t = useTranslations('traces.detail');
    const openLogTarget = useNavStore((state) => state.openLogTarget);
    const detailQuery = useRequestTraceDetail(traceId ?? undefined, !!traceId);
    const detail = detailQuery.data;

    if (!traceId) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                {t('empty')}
            </div>
        );
    }

    if (detailQuery.isLoading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (detailQuery.error || !detail) {
        return (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {t('loadFailed')}
            </div>
        );
    }

    const trace = detail.trace;

    return (
        <aside className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <GitBranch className="size-4 text-primary" />
                        {t('title')}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={trace.trace_id}>
                        {trace.trace_id}
                    </div>
                </div>
                {trace.relay_log_id ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md px-2 text-xs"
                        onClick={() => openLogTarget({ logId: trace.relay_log_id, traceId: trace.trace_id })}
                    >
                        {t('openLog')}
                        <ArrowRight className="size-3.5" />
                    </Button>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('clientModel')}</div>
                    <div className="mt-1 truncate font-medium" title={trace.client_model}>{trace.client_model || '-'}</div>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('finalStatus')}</div>
                    <Badge variant="outline" className={cn('mt-1 h-5 rounded-md px-1.5 text-[10px]', statusClass(trace.final_status))}>
                        {trace.final_status || '-'}
                    </Badge>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('latency')}</div>
                    <div className="mt-1 font-mono tabular-nums">{formatDuration(trace.total_latency_ms)}</div>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('cost')}</div>
                    <div className="mt-1 font-mono tabular-nums">{formatCost(trace.total_attempt_cost || trace.estimated_cost)}</div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{t('attemptTimeline')}</div>
                <div className="space-y-2">
                    {detail.attempts.length === 0 ? (
                        <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                            {t('noAttempts')}
                        </div>
                    ) : detail.attempts.map((attempt, index) => (
                        <div key={`${attempt.id}-${index}`} className="rounded-lg border bg-background/40 p-3">
                            <div className="flex flex-wrap items-start gap-2">
                                <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[11px]', statusClass(attempt.status))}>
                                    {attempt.status || '-'}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium" title={attempt.channel_name || undefined}>
                                        {attempt.channel_name || t('channelFallback', { id: attempt.channel_id || 0 })}
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-muted-foreground" title={attempt.upstream_model || attempt.model_name || undefined}>
                                        {attempt.model_name || '-'} {'->'} {attempt.upstream_model || '-'}
                                    </div>
                                </div>
                                <div className="text-right text-xs font-mono tabular-nums">
                                    <div>{formatDuration(attempt.total_ms || attempt.duration_ms)}</div>
                                    <div className="text-muted-foreground">TTFB {formatDuration(attempt.ttfb_ms)}</div>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                                <div>
                                    <div className="text-muted-foreground">{t('http')}</div>
                                    <div className="font-mono">{attempt.http_status || '-'}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">{t('key')}</div>
                                    <div>{attempt.key_id || attempt.channel_key_id ? `#${attempt.key_id || attempt.channel_key_id}` : '-'}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">{t('siteAccount')}</div>
                                    <div>{t('siteAccountValue', { site: attempt.site_id || 0, account: attempt.account_id || attempt.site_account_id || 0 })}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">{t('retryable')}</div>
                                    <div>{attempt.retryable ? t('yes') : t('no')}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-muted-foreground">{t('tokens')}</div>
                                    <div className="font-mono">{formatAttemptTokens(attempt)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">{t('cost')}</div>
                                    <div className="font-mono">{formatCost(attempt.estimated_cost)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">{t('protocol')}</div>
                                    <div className="truncate" title={protocolPath(attempt)}>{protocolPath(attempt)}</div>
                                </div>
                            </div>

                            {attempt.failure_reason || attempt.error_summary ? (
                                <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                                    <div className="font-medium">{attempt.failure_reason || '-'}</div>
                                    {attempt.error_summary ? (
                                        <div className="mt-1 break-words text-destructive/80">{attempt.error_summary}</div>
                                    ) : null}
                                </div>
                            ) : null}

                            {attempt.base_url ? (
                                <div className="mt-2 truncate text-xs text-muted-foreground" title={attempt.base_url}>
                                    {t('baseUrl')}: {attempt.base_url}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}

export function Traces() {
    const t = useTranslations('traces');
    const [page, setPage] = useState(1);
    const [timeRange, setTimeRange] = useState('24h');
    const [modelFilter, setModelFilter] = useState('');
    const [traceFilter, setTraceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [streamFilter, setStreamFilter] = useState('all');
    const [failoverFilter, setFailoverFilter] = useState('all');
    const [httpStatusFilter, setHTTPStatusFilter] = useState('');
    const [failureFilter, setFailureFilter] = useState('');
    const [protocolFilter, setProtocolFilter] = useState('all');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState('10000');
    const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

    const params = useMemo<RequestTraceListParams>(() => ({
        page,
        page_size: PAGE_SIZE,
        time_range: nonAll(timeRange),
        model: modelFilter.trim() || undefined,
        trace_id: traceFilter.trim() || undefined,
        status: nonAll(statusFilter),
        source: nonAll(sourceFilter),
        stream: optionalBoolean(streamFilter),
        failover: optionalBoolean(failoverFilter),
        http_status: httpStatusFilter.trim() || undefined,
        failure_reason: failureFilter.trim() || undefined,
        protocol: nonAll(protocolFilter),
        sort_by: 'time',
        sort_order: 'desc',
    }), [
        failureFilter,
        failoverFilter,
        httpStatusFilter,
        modelFilter,
        page,
        protocolFilter,
        sourceFilter,
        statusFilter,
        streamFilter,
        timeRange,
        traceFilter,
    ]);

    const tracesQuery = useRequestTraces(params, {
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
    });

    useEffect(() => {
        setPage(1);
    }, [failureFilter, failoverFilter, httpStatusFilter, modelFilter, protocolFilter, sourceFilter, statusFilter, streamFilter, timeRange, traceFilter]);

    useEffect(() => {
        if (!autoRefresh) return;
        void tracesQuery.refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRefresh]);

    const traces = useMemo(() => tracesQuery.data?.items ?? [], [tracesQuery.data?.items]);
    const total = tracesQuery.data?.total ?? 0;

    useEffect(() => {
        if (traces.length === 0) {
            setSelectedTraceId(null);
            return;
        }
        if (selectedTraceId && traces.some((trace) => trace.trace_id === selectedTraceId)) return;
        setSelectedTraceId(traces[0].trace_id);
    }, [selectedTraceId, traces]);

    const summary = useMemo(() => {
        const success = traces.filter((trace) => trace.final_status === 'success').length;
        const failed = traces.filter((trace) => trace.final_status === 'failed').length;
        const failover = traces.filter((trace) => (trace.attempts_count || 0) > 1).length;
        const avgLatency = traces.length === 0
            ? 0
            : Math.round(traces.reduce((sum, trace) => sum + (trace.total_latency_ms || 0), 0) / traces.length);
        return { success, failed, failover, avgLatency };
    }, [traces]);

    const resetFilters = useCallback(() => {
        setTimeRange('24h');
        setModelFilter('');
        setTraceFilter('');
        setStatusFilter('all');
        setSourceFilter('all');
        setStreamFilter('all');
        setFailoverFilter('all');
        setHTTPStatusFilter('');
        setFailureFilter('');
        setProtocolFilter('all');
    }, []);

    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <SummaryTile
                    label={t('summary.total')}
                    value={formatCount(total)}
                    sub={t('summary.page', { count: traces.length })}
                    icon={Database}
                />
                <SummaryTile
                    label={t('summary.success')}
                    value={`${summary.success}/${traces.length}`}
                    sub={t('summary.failed', { count: summary.failed })}
                    icon={ShieldAlert}
                />
                <SummaryTile
                    label={t('summary.failover')}
                    value={formatCount(summary.failover)}
                    sub={t('summary.failoverSub')}
                    icon={GitBranch}
                />
                <SummaryTile
                    label={t('summary.latency')}
                    value={formatDuration(summary.avgLatency)}
                    sub={t('summary.latencySub')}
                    icon={Timer}
                />
            </div>

            <div className="rounded-lg border bg-card p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-8 rounded-md px-2">
                        {t('title')}
                    </Badge>
                    {tracesQuery.error ? (
                        <Badge variant="outline" className="h-8 border-destructive/30 px-2 text-destructive">
                            {t('loadFailed')}
                        </Badge>
                    ) : null}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                            <span className="text-sm text-muted-foreground">{t('autoRefresh')}</span>
                        </div>
                        <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                            <SelectTrigger size="sm" className="w-[92px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5000">{t('interval.5s')}</SelectItem>
                                <SelectItem value="10000">{t('interval.10s')}</SelectItem>
                                <SelectItem value="30000">{t('interval.30s')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="sm" onClick={() => void tracesQuery.refetch()} disabled={tracesQuery.isFetching}>
                            {tracesQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            {t('refresh')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder={t('filters.model')} className="pl-8" />
                    </div>
                    <Input value={traceFilter} onChange={(event) => setTraceFilter(event.target.value)} placeholder={t('filters.trace')} />
                    <Input value={httpStatusFilter} onChange={(event) => setHTTPStatusFilter(event.target.value)} placeholder={t('filters.http')} />
                    <Input value={failureFilter} onChange={(event) => setFailureFilter(event.target.value)} placeholder={t('filters.failure')} />
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">{t('range.1h')}</SelectItem>
                            <SelectItem value="24h">{t('range.24h')}</SelectItem>
                            <SelectItem value="7d">{t('range.7d')}</SelectItem>
                            <SelectItem value="30d">{t('range.30d')}</SelectItem>
                            <SelectItem value="all">{t('range.all')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('status.all')}</SelectItem>
                            <SelectItem value="success">{t('status.success')}</SelectItem>
                            <SelectItem value="failed">{t('status.failed')}</SelectItem>
                            <SelectItem value="canceled">{t('status.canceled')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('source.all')}</SelectItem>
                            <SelectItem value="relay">Relay</SelectItem>
                            <SelectItem value="model_test">Model Test</SelectItem>
                            <SelectItem value="images">Images</SelectItem>
                            <SelectItem value="probe">Probe</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={streamFilter} onValueChange={setStreamFilter}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('stream.all')}</SelectItem>
                            <SelectItem value="true">{t('stream.stream')}</SelectItem>
                            <SelectItem value="false">{t('stream.nonStream')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={failoverFilter} onValueChange={setFailoverFilter}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('failover.all')}</SelectItem>
                            <SelectItem value="true">{t('failover.yes')}</SelectItem>
                            <SelectItem value="false">{t('failover.no')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('protocol.all')}</SelectItem>
                            <SelectItem value="openai_chat">OpenAI Chat</SelectItem>
                            <SelectItem value="openai_responses">OpenAI Responses</SelectItem>
                            <SelectItem value="anthropic">Anthropic</SelectItem>
                            <SelectItem value="gemini">Gemini</SelectItem>
                            <SelectItem value="ws">WebSocket</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                        <X className="size-4" />
                        {t('reset')}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page <= 1 || tracesQuery.isFetching}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                        >
                            <ArrowLeft className="size-4" />
                            {t('pager.prev')}
                        </Button>
                        <Badge variant="outline" className="h-8 rounded-md px-2">
                            {t('pager.page', { page, total: maxPage })}
                        </Badge>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!tracesQuery.data?.has_more || tracesQuery.isFetching}
                            onClick={() => setPage((current) => current + 1)}
                        >
                            {t('pager.next')}
                            <ArrowRight className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
                <div className="relative min-h-0">
                    {tracesQuery.isLoading ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border bg-card">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : traces.length === 0 ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                            {t('empty')}
                        </div>
                    ) : (
                        <TraceTable
                            items={traces}
                            selectedTraceId={selectedTraceId}
                            onSelect={setSelectedTraceId}
                        />
                    )}
                </div>
                <TraceDetailPanel traceId={selectedTraceId} />
            </div>
        </div>
    );
}
