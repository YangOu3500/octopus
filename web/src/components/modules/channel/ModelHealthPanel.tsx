'use client';

import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Activity, AlertTriangle, Download, Gauge, LoaderCircle, RefreshCw, Search, Server, ShieldCheck, Thermometer, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useChannelList, useChannelModelHealth, type ChannelModelHealthRow } from '@/api/endpoints/channel';
import { toast } from '@/components/common/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const HEALTH_ROW_GRID_COLUMNS = 'minmax(13rem,1.35fr) minmax(9rem,0.9fr) minmax(10rem,0.95fr) minmax(9rem,0.9fr) minmax(9rem,0.9fr) minmax(14rem,1.1fr)';
const QUOTA_FILTER_STATUSES = [
    'available',
    'rate_limited',
    'zero_balance',
    'quota_error',
    'auth_error',
    'no_key',
    'site_disabled',
    'account_disabled',
    'account_missing',
    'model_disabled',
    'unknown',
] as const;
const CHANNEL_MODEL_HEALTH_EXPORT_VERSION = 3;

function formatNumber(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return new Intl.NumberFormat().format(value);
}

function formatDecimal(value: number | undefined, digits = 1) {
    if (!value || value <= 0) return '-';
    return value.toFixed(digits);
}

function formatPercent(value: number | undefined, hasSamples = true) {
    if (!hasSamples) return '-';
    return `${((value ?? 0) * 100).toFixed(0)}%`;
}

function formatMS(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function formatCost(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return `$${value.toFixed(6)}`;
}

function formatCooldown(value: number | undefined) {
    if (!value || value <= 0) return '-';
    const seconds = Math.ceil(value / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.ceil(minutes / 60)}h`;
}

function formatUnixTime(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return new Date(value * 1000).toLocaleString();
}

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
}

function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeChannelModelHealthRowForExport(row: ChannelModelHealthRow) {
    return compactObject({
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        managed: row.managed,
        site_id: row.site_id,
        site_name: row.site_name,
        site_account_id: row.site_account_id,
        site_account_name: row.site_account_name,
        model_name: row.model_name,
        request_count: row.request_count,
        success_count: row.success_count,
        failure_count: row.failure_count,
        success_rate: row.success_rate,
        rpm: row.rpm,
        avg_ttfb_ms: row.avg_ttfb_ms,
        avg_total_ms: row.avg_total_ms,
        tokens_per_second: row.tokens_per_second,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        cache_tokens: row.cache_tokens,
        estimated_cost: row.estimated_cost,
        health_score: row.health_score,
        health_sample_count: row.health_sample_count,
        health_success_count: row.health_success_count,
        health_failure_count: row.health_failure_count,
        health_success_rate: row.health_success_rate,
        empty_response_rate: row.empty_response_rate,
        rate_limit_count: row.rate_limit_count,
        active_selections: row.active_selections,
        channel_concurrency_active: row.channel_concurrency_active,
        channel_concurrency_limit: row.channel_concurrency_limit,
        channel_concurrency_mode: row.channel_concurrency_mode,
        cooling_down: row.cooling_down,
        cooldown_remaining_ms: row.cooldown_remaining_ms,
        cooldown_reason: row.cooldown_reason,
        quota_status: row.quota_status,
        quota_reason: row.quota_reason,
        quota_balance: row.quota_balance,
        quota_used: row.quota_used,
        capacity_status: row.capacity_status,
        capacity_reason: row.capacity_reason,
        capacity_scope: row.capacity_scope,
        capacity_source: row.capacity_source,
        last_observed_at: row.last_observed_at,
        expires_at: row.expires_at,
        last_http_status: row.last_http_status,
        last_failure_reason: row.last_failure_reason,
        last_seen_time: row.last_seen_time,
    });
}

function healthTone(score: number) {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
}

function quotaTone(status: string) {
    switch (status) {
        case 'available':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'rate_limited':
        case 'zero_balance':
        case 'no_key':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'quota_error':
        case 'auth_error':
        case 'site_disabled':
        case 'account_disabled':
        case 'account_missing':
        case 'model_disabled':
            return 'border-destructive/20 bg-destructive/10 text-destructive';
        default:
            return 'border-muted-foreground/20 bg-muted text-muted-foreground';
    }
}

function rowStatusTone(row: ChannelModelHealthRow) {
    if (row.cooling_down) return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (row.failure_count > 0 && row.success_count === 0) return 'border-destructive/20 bg-destructive/10 text-destructive';
    if (row.request_count > 0) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-muted-foreground/20 bg-muted text-muted-foreground';
}

type ChannelHealthStatus = 'cooldown' | 'failed' | 'active' | 'idle';

function rowStatus(row: ChannelModelHealthRow): ChannelHealthStatus {
    if (row.cooling_down) return 'cooldown';
    if (row.failure_count > 0 && row.success_count === 0) return 'failed';
    if (row.request_count > 0) return 'active';
    return 'idle';
}

function sourceLabel(t: ReturnType<typeof useTranslations<'channel.health'>>, source: string) {
    switch (source) {
        case 'relay':
            return t('source.relay');
        case 'model_test':
            return t('source.modelTest');
        case 'probe':
            return t('source.probe');
        default:
            return t('source.all');
    }
}

function quotaLabel(t: ReturnType<typeof useTranslations<'channel.health'>>, status: string) {
    switch (status) {
        case 'available':
            return t('quota.available');
        case 'zero_balance':
            return t('quota.zeroBalance');
        case 'account_disabled':
            return t('quota.accountDisabled');
        case 'quota_error':
            return t('quota.quotaError');
        case 'auth_error':
            return t('quota.authError');
        case 'rate_limited':
            return t('quota.rateLimited');
        case 'no_key':
            return t('quota.noKey');
        case 'site_disabled':
            return t('quota.siteDisabled');
        case 'account_missing':
            return t('quota.accountMissing');
        case 'model_disabled':
            return t('quota.modelDisabled');
        default:
            return t('quota.unknown');
    }
}

function capacityLabel(t: ReturnType<typeof useTranslations<'channel.health'>>, status: string | undefined) {
    switch (status) {
        case 'available':
            return t('capacity.available');
        case 'blocked':
            return t('capacity.blocked');
        default:
            return t('capacity.unknown');
    }
}

function queueModeLabel(t: ReturnType<typeof useTranslations<'channel.health'>>, mode: string | undefined) {
    switch (mode) {
        case 'database':
            return t('queueMode.database');
        case 'local':
        default:
            return t('queueMode.local');
    }
}

export function ChannelModelHealthPanel() {
    const t = useTranslations('channel.health');
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [timeRange, setTimeRange] = useState('24h');
    const [channelId, setChannelId] = useState('all');
    const [source, setSource] = useState('all');
    const [quotaStatus, setQuotaStatus] = useState('all');
    const [modelQuery, setModelQuery] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState('5000');
    const { data: channelsData } = useChannelList();
    const {
        data,
        isLoading,
        error,
        refetch,
        isFetching,
    } = useChannelModelHealth({
        timeRange,
        channelId: channelId === 'all' ? null : Number(channelId),
        model: modelQuery,
        source,
        quotaStatus,
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
    });

    const rows = data?.rows ?? [];
    const summary = data?.summary;
    const filteredChannels = (channelsData ?? [])
        .map((item) => item.raw)
        .sort((a, b) => a.name.localeCompare(b.name));
    const quotaStatusCounts = summary?.quota_status_counts ?? {};
    const quotaStatusChips = QUOTA_FILTER_STATUSES.filter((status) => (quotaStatusCounts[status] ?? 0) > 0);
    const quotaAvailableCount = quotaStatusCounts.available ?? 0;
    const quotaUnknownCount = quotaStatusCounts.unknown ?? 0;
    const exportCurrentRows = () => {
        if (rows.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        try {
            const exportedAt = exportTimestamp();
            downloadJson(`octopus-channel-model-health-${exportFilenameTimestamp()}.json`, {
                export_version: CHANNEL_MODEL_HEALTH_EXPORT_VERSION,
                exported_at: exportedAt,
                filters: compactObject({
                    time_range: timeRange,
                    channel_id: channelId === 'all' ? undefined : Number(channelId),
                    source: source === 'all' ? undefined : source,
                    quota_status: quotaStatus === 'all' ? undefined : quotaStatus,
                    model: modelQuery.trim() || undefined,
                }),
                summary,
                rows: rows.map(sanitizeChannelModelHealthRowForExport),
            });
            toast.success(t('export.success'), { description: t('export.safe') });
        } catch (error) {
            toast.error(t('export.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    };

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        getItemKey: (index) => {
            const row = rows[index];
            return row ? `${row.channel_id}-${row.model_name}` : `health-row-${index}`;
        },
        estimateSize: () => 112,
        measureElement: (element) =>
            element instanceof HTMLElement ? element.offsetHeight : element.getBoundingClientRect().height,
        overscan: 8,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();

    useEffect(() => {
        if (!autoRefresh) return;
        void refetch();
    }, [autoRefresh, refreshInterval, refetch]);

    const metricCards = [
        {
            id: 'rows',
            icon: Server,
            label: t('stats.rows'),
            value: formatNumber(summary?.total_rows),
            sub: t('stats.rowsSub', { requests: summary?.total_requests ?? 0 }),
        },
        {
            id: 'success',
            icon: ShieldCheck,
            label: t('stats.successRate'),
            value: formatPercent(summary?.avg_success_rate, (summary?.success_count ?? 0) + (summary?.failure_count ?? 0) > 0),
            sub: t('stats.successSub', { success: summary?.success_count ?? 0, failed: summary?.failure_count ?? 0 }),
        },
        {
            id: 'health',
            icon: Gauge,
            label: t('stats.healthScore'),
            value: formatDecimal(summary?.avg_health_score, 1),
            sub: t(`strategy.${summary?.load_balancing_strategy === 'health_score' ? 'healthScore' : 'staticGroupMode'}`),
        },
        {
            id: 'load',
            icon: Activity,
            label: t('stats.load'),
            value: formatNumber((summary?.active_selections ?? 0) + (summary?.channel_concurrency_active ?? 0)),
            sub: summary?.channel_concurrency_enabled
                ? t('stats.loadSubWithConcurrency', {
                    cooldown: summary?.cooling_down_count ?? 0,
                    active: summary?.channel_concurrency_active ?? 0,
                    limit: summary?.channel_concurrency_max ?? 0,
                    mode: queueModeLabel(t, summary?.channel_concurrency_mode),
                })
                : t('stats.loadSub', { cooldown: summary?.cooling_down_count ?? 0 }),
        },
        {
            id: 'capacity',
            icon: Wallet,
            label: t('stats.capacity'),
            value: (summary?.capacity_blocked_count ?? 0).toLocaleString(),
            sub: t('stats.capacitySub', {
                available: quotaAvailableCount,
                unknown: quotaUnknownCount,
            }),
        },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <section className="shrink-0 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <Thermometer className="size-4 text-primary" />
                                {t('title')}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="rounded-md">
                                    {summary?.health_score_enabled ? t('healthEnabled') : t('healthDisabled')}
                                </Badge>
                                <Badge variant="outline" className="rounded-md">
                                    {summary?.channel_concurrency_enabled
                                        ? t('queueMode.enabled', { mode: queueModeLabel(t, summary.channel_concurrency_mode) })
                                        : t('queueMode.disabled')}
                                </Badge>
                                <span>{sourceLabel(t, source)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[8rem_minmax(12rem,1fr)_8rem_9rem_minmax(14rem,1fr)]">
                            <Select value={timeRange} onValueChange={setTimeRange}>
                                <SelectTrigger className="h-9 w-full rounded-lg">
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
                            <Select value={channelId} onValueChange={setChannelId}>
                                <SelectTrigger className="h-9 w-full rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('channelAll')}</SelectItem>
                                    {filteredChannels.map((channel) => (
                                        <SelectItem key={channel.id} value={String(channel.id)}>
                                            {channel.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={source} onValueChange={setSource}>
                                <SelectTrigger className="h-9 w-full rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('source.all')}</SelectItem>
                                    <SelectItem value="relay">{t('source.relay')}</SelectItem>
                                    <SelectItem value="model_test">{t('source.modelTest')}</SelectItem>
                                    <SelectItem value="probe">{t('source.probe')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={quotaStatus} onValueChange={setQuotaStatus}>
                                <SelectTrigger className="h-9 w-full rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('quota.all')}</SelectItem>
                                    {QUOTA_FILTER_STATUSES.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {quotaLabel(t, status)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative min-w-0">
                                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={modelQuery}
                                    onChange={(event) => setModelQuery(event.target.value)}
                                    placeholder={t('searchModel')}
                                    className="h-9 rounded-lg pl-9"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        {metricCards.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.id} className="rounded-lg border border-border bg-background/50 px-3 py-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Icon className="size-3.5" />
                                        {item.label}
                                    </div>
                                    <div className="mt-1 text-xl font-semibold tabular-nums">{item.value}</div>
                                    <div className="mt-0.5 truncate text-xs text-muted-foreground" title={item.sub}>
                                        {item.sub}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant={quotaStatus === 'all' ? 'default' : 'outline'}
                                size="sm"
                                className="h-8 rounded-lg"
                                onClick={() => setQuotaStatus('all')}
                            >
                                {t('quota.all')}
                                <span className="ml-1 tabular-nums">{summary?.total_rows ?? 0}</span>
                            </Button>
                            {quotaStatusChips.map((status) => (
                                <Button
                                    key={status}
                                    type="button"
                                    variant={quotaStatus === status ? 'default' : 'outline'}
                                    size="sm"
                                    className={cn('h-8 rounded-lg', quotaStatus !== status && quotaTone(status))}
                                    onClick={() => setQuotaStatus(status)}
                                >
                                    {quotaLabel(t, status)}
                                    <span className="ml-1 tabular-nums">{quotaStatusCounts[status]}</span>
                                </Button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground">
                                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                                {t('autoRefresh')}
                            </label>
                            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                                <SelectTrigger className="h-9 w-[7rem] rounded-lg" disabled={!autoRefresh}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5000">5s</SelectItem>
                                    <SelectItem value="10000">10s</SelectItem>
                                    <SelectItem value="30000">30s</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => refetch()}>
                                <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
                                {t('refresh')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-lg"
                                onClick={exportCurrentRows}
                                disabled={rows.length === 0}
                            >
                                <Download className="size-4" />
                                {t('export.button')}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        {t('loading')}
                    </div>
                ) : error ? (
                    <div className="flex h-full items-center justify-center text-sm text-destructive">
                        <AlertTriangle className="mr-2 size-4" />
                        {t('loadFailed')}
                    </div>
                ) : (
                    <div ref={scrollRef} className="h-full overflow-auto overscroll-contain">
                        <div className="min-w-[64rem] text-left text-sm">
                            <div
                                className="sticky top-0 z-10 grid border-b border-border bg-muted/90 text-xs text-muted-foreground backdrop-blur"
                                style={{ gridTemplateColumns: HEALTH_ROW_GRID_COLUMNS }}
                            >
                                <div className="px-3 py-2 font-medium">{t('table.channel')}</div>
                                <div className="px-3 py-2 font-medium">{t('table.health')}</div>
                                <div className="px-3 py-2 font-medium">{t('table.calls')}</div>
                                <div className="px-3 py-2 font-medium">{t('table.latency')}</div>
                                <div className="px-3 py-2 font-medium">{t('table.load')}</div>
                                <div className="px-3 py-2 font-medium">{t('table.quota')}</div>
                            </div>

                            {rows.length === 0 ? (
                                <div className="px-3 py-12 text-center text-sm text-muted-foreground">
                                    {t('empty')}
                                </div>
                            ) : (
                                <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                                    {virtualRows.map((virtualRow) => {
                                        const row = rows[virtualRow.index];
                                        if (!row) return null;

                                        return (
                                            <div
                                                key={virtualRow.key}
                                                data-index={virtualRow.index}
                                                ref={rowVirtualizer.measureElement}
                                                className="absolute left-0 top-0 grid w-full border-b border-border/60"
                                                style={{
                                                    gridTemplateColumns: HEALTH_ROW_GRID_COLUMNS,
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                            >
                                                <div className="max-w-[16rem] px-3 py-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <div className="truncate font-medium" title={row.channel_name}>{row.channel_name || `#${row.channel_id}`}</div>
                                                        {row.managed ? <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">{t('managed')}</Badge> : null}
                                                    </div>
                                                    <div className="mt-1 truncate text-xs text-muted-foreground" title={row.model_name}>{row.model_name}</div>
                                                    {row.site_account_name || row.site_name ? (
                                                        <div className="mt-1 truncate text-xs text-muted-foreground" title={row.site_account_name || row.site_name}>
                                                            {row.site_account_name || row.site_name}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">
                                                    <div className={cn('text-base font-semibold', healthTone(row.health_score))}>
                                                        {row.health_score.toFixed(1)}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {row.health_sample_count ? t('healthSamples', {
                                                            success: row.health_success_count,
                                                            total: row.health_sample_count,
                                                            rate: formatPercent(row.health_success_rate),
                                                        }) : t('noSamples')}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {t('emptyRate')}: {formatPercent(row.empty_response_rate, row.health_sample_count > 0)} / 429 {formatNumber(row.rate_limit_count)}
                                                    </div>
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">
                                                    <Badge variant="outline" className={cn('rounded-md text-[11px]', rowStatusTone(row))}>
                                                        {t(`status.${rowStatus(row)}`)}
                                                    </Badge>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {t('callMeta', {
                                                            success: row.success_count,
                                                            failed: row.failure_count,
                                                            rate: formatPercent(row.success_rate, row.request_count > 0),
                                                        })}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">{t('requests')}: {formatNumber(row.request_count)}</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {formatDecimal(row.tokens_per_second, 1)} Tok/s / RPM {formatDecimal(row.rpm, 2)}
                                                    </div>
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">
                                                    <div>{t('ttfb')}: {formatMS(row.avg_ttfb_ms)}</div>
                                                    <div className="text-xs text-muted-foreground">{t('duration')}: {formatMS(row.avg_total_ms)}</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">{t('tokenIn')}: {formatNumber(row.input_tokens)}</div>
                                                    <div className="text-xs text-muted-foreground">{t('tokenOut')}: {formatNumber(row.output_tokens)}</div>
                                                    <div className="text-xs text-muted-foreground">{t('tokenCache')}: {formatNumber(row.cache_tokens)}</div>
                                                    <div className="mt-1">{formatCost(row.estimated_cost)}</div>
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">
                                                    <div>{t('activeSelections')}: {formatNumber(row.active_selections)}</div>
                                                    {row.channel_concurrency_limit ? (
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {t('channelConcurrency')}: {(row.channel_concurrency_active ?? 0).toLocaleString()} / {row.channel_concurrency_limit}
                                                        </div>
                                                    ) : null}
                                                    {row.channel_concurrency_mode ? (
                                                        <div className="text-xs text-muted-foreground">
                                                            {queueModeLabel(t, row.channel_concurrency_mode)}
                                                        </div>
                                                    ) : null}
                                                    {row.cooling_down ? (
                                                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                                            {row.cooldown_reason || t('cooldown')} / {formatCooldown(row.cooldown_remaining_ms)}
                                                        </div>
                                                    ) : (
                                                        <div className="mt-1 text-xs text-muted-foreground">{t('noCooldown')}</div>
                                                    )}
                                                </div>
                                                <div className="px-3 py-3">
                                                    <Badge variant="outline" className={cn('rounded-md text-[11px]', quotaTone(row.quota_status))}>
                                                        <Wallet className="size-3" />
                                                        {quotaLabel(t, row.quota_status)}
                                                    </Badge>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {row.quota_balance !== undefined ? `${formatDecimal(row.quota_balance, 2)} / ${formatDecimal(row.quota_used, 2)}` : '-'}
                                                    </div>
                                                    {row.quota_reason ? (
                                                        <div className="mt-0.5 truncate text-xs text-muted-foreground" title={row.quota_reason}>
                                                            {t('quota.reason')}: {row.quota_reason}
                                                        </div>
                                                    ) : null}
                                                    <div className="mt-0.5 truncate text-xs text-muted-foreground" title={`${row.capacity_source || '-'} / ${row.capacity_scope || '-'}`}>
                                                        {t('capacity.label')}: {capacityLabel(t, row.capacity_status)}
                                                    </div>
                                                    {row.capacity_source || row.capacity_scope ? (
                                                        <div className="truncate text-xs text-muted-foreground" title={`${row.capacity_source || '-'} / ${row.capacity_scope || '-'}`}>
                                                            {row.capacity_source || '-'} / {row.capacity_scope || '-'}
                                                        </div>
                                                    ) : null}
                                                    {row.expires_at ? (
                                                        <div className="truncate text-xs text-muted-foreground" title={formatUnixTime(row.expires_at)}>
                                                            {t('capacity.expires')}: {formatUnixTime(row.expires_at)}
                                                        </div>
                                                    ) : null}
                                                    {row.last_observed_at ? (
                                                        <div className="truncate text-xs text-muted-foreground" title={formatUnixTime(row.last_observed_at)}>
                                                            {t('capacity.observed')}: {formatUnixTime(row.last_observed_at)}
                                                        </div>
                                                    ) : null}
                                                    <div className="text-xs tabular-nums text-muted-foreground">
                                                        {row.last_http_status ? `HTTP ${row.last_http_status}` : '-'}
                                                    </div>
                                                    <div className="mt-1 line-clamp-2 text-xs text-destructive" title={row.last_failure_reason || ''}>
                                                        {row.last_failure_reason || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
