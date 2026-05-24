'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Download, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';

import { useChannelList, useChannelModelHealth, type ChannelModelHealthRow } from '@/api/endpoints/channel';
import { HealthSummaryCards, StrategyPanel } from './health-summary';
import { HealthCharts } from './health-charts';
import { HealthTable } from './health-table';
import { cn } from '@/lib/utils';

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

// helper JSON downloader
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

function rowReason(row: ChannelModelHealthRow) {
    return row.capacity_reason
        || row.quota_reason
        || (row.cooling_down ? row.cooldown_reason : '')
        || row.last_failure_reason
        || (row.quota_status && row.quota_status !== 'available' && row.quota_status !== 'unknown' ? row.quota_status : '');
}

function quotaTone(status: string) {
    switch (status) {
        case 'available':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20';
        case 'rate_limited':
        case 'zero_balance':
        case 'no_key':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20';
        case 'quota_error':
        case 'auth_error':
        case 'site_disabled':
        case 'account_disabled':
        case 'account_missing':
        case 'model_disabled':
            return 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20';
        default:
            return 'border-border bg-background text-muted-foreground hover:bg-muted/10';
    }
}

type Translator = ReturnType<typeof useTranslations>;

function quotaLabel(t: Translator, status: string) {
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

function sanitizeChannelModelHealthRowForExport(row: ChannelModelHealthRow) {
    return {
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
    };
}

export function ModelHealth() {
    const t = useTranslations('channel.health');

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

    const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
    const summary = data?.summary;

    const filteredChannels = useMemo(() => {
        return (channelsData ?? [])
            .map((item) => item.raw)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [channelsData]);

    const quotaStatusCounts = summary?.quota_status_counts ?? {};
    const quotaStatusChips = QUOTA_FILTER_STATUSES.filter((status) => (quotaStatusCounts[status] ?? 0) > 0);

    const blockedRows = useMemo(
        () => rows.filter((row) => row.cooling_down || row.capacity_status === 'blocked' || (row.quota_status !== 'available' && row.quota_status !== 'unknown')),
        [rows]
    );

    const topBlockedReasons = useMemo(
        () => Array.from(
            blockedRows.reduce((map, row) => {
                const key = rowReason(row) || 'unknown';
                map.set(key, (map.get(key) || 0) + 1);
                return map;
            }, new Map<string, number>()).entries(),
        ).sort((left, right) => right[1] - left[1]).slice(0, 3),
        [blockedRows]
    );

    const mostLoadedRow = useMemo(
        () => [...rows].sort((left, right) => {
            const leftLoad = (left.active_selections ?? 0) + (left.channel_concurrency_active ?? 0);
            const rightLoad = (right.active_selections ?? 0) + (right.channel_concurrency_active ?? 0);
            return rightLoad - leftLoad || right.request_count - left.request_count || left.channel_name.localeCompare(right.channel_name);
        })[0],
        [rows]
    );

    const worstHealthRow = useMemo(
        () => [...rows]
            .filter((row) => row.health_sample_count > 0)
            .sort((left, right) => left.health_score - right.health_score || right.failure_count - left.failure_count || left.channel_name.localeCompare(right.channel_name))[0],
        [rows]
    );

    const rangeLabel = useMemo(() => {
        switch (timeRange) {
            case '1h':
                return t('range.1h');
            case '7d':
                return t('range.7d');
            case '30d':
                return t('range.30d');
            case 'all':
                return t('range.all');
            default:
                return t('range.24h');
        }
    }, [t, timeRange]);

    const handleExport = () => {
        if (rows.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        try {
            downloadJson(`octopus-channel-model-health-${new Date().getTime()}.json`, {
                export_version: CHANNEL_MODEL_HEALTH_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                filters: {
                    time_range: timeRange,
                    channel_id: channelId === 'all' ? undefined : Number(channelId),
                    source: source === 'all' ? undefined : source,
                    quota_status: quotaStatus === 'all' ? undefined : quotaStatus,
                    model: modelQuery.trim() || undefined,
                },
                summary,
                rows: rows.map(sanitizeChannelModelHealthRowForExport),
            });
            toast.success(t('export.success'));
        } catch (err) {
            toast.error(t('export.failed'), { description: err instanceof Error ? err.message : String(err) });
        }
    };

    useEffect(() => {
        if (!autoRefresh) return;
        const timer = setInterval(() => {
            void refetch();
        }, Number(refreshInterval));
        return () => clearInterval(timer);
    }, [autoRefresh, refreshInterval, refetch]);

    return (
        <div className="flex flex-col gap-4 text-xs h-full min-h-0">
            <PageHeader
                title="模型健康工作台"
                description="监控各渠道模型的请求成功率、延迟、负载情况及熔断冷却状态"
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={() => refetch()}
                        >
                            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
                            <span>{t('refresh')}</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={handleExport}
                            disabled={rows.length === 0}
                        >
                            <Download className="size-4" />
                            <span>{t('export.button')}</span>
                        </Button>
                    </div>
                }
            />

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2 bg-card border border-border p-3 rounded-xl shrink-0">
                <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-8 w-28 rounded-lg text-[11px] font-semibold">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1h" className="text-[11px]">{t('range.1h')}</SelectItem>
                        <SelectItem value="24h" className="text-[11px]">{t('range.24h')}</SelectItem>
                        <SelectItem value="7d" className="text-[11px]">{t('range.7d')}</SelectItem>
                        <SelectItem value="30d" className="text-[11px]">{t('range.30d')}</SelectItem>
                        <SelectItem value="all" className="text-[11px]">{t('range.all')}</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger className="h-8 w-36 rounded-lg text-[11px] font-semibold">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-[11px]">{t('channelAll')}</SelectItem>
                        {filteredChannels.map((channel) => (
                            <SelectItem key={channel.id} value={String(channel.id)} className="text-[11px]">
                                {channel.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="h-8 w-28 rounded-lg text-[11px] font-semibold">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-[11px]">{t('source.all')}</SelectItem>
                        <SelectItem value="relay" className="text-[11px]">{t('source.relay')}</SelectItem>
                        <SelectItem value="model_test" className="text-[11px]">{t('source.modelTest')}</SelectItem>
                        <SelectItem value="probe" className="text-[11px]">{t('source.probe')}</SelectItem>
                    </SelectContent>
                </Select>

                <div className="relative w-48 flex-1 min-w-[150px]">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        placeholder={t('searchModel')}
                        className="h-8 rounded-lg pl-8 text-[11px]"
                    />
                </div>

                <div className="flex items-center gap-2 border rounded-lg h-8 px-2.5 bg-background/50 text-[11px] font-semibold text-muted-foreground/80">
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
                    <span>{t('autoRefresh')}</span>
                </div>

                <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                    <SelectTrigger className="h-8 w-20 rounded-lg text-[11px] font-semibold" disabled={!autoRefresh}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="5000" className="text-[11px]">5s</SelectItem>
                        <SelectItem value="10000" className="text-[11px]">10s</SelectItem>
                        <SelectItem value="30000" className="text-[11px]">30s</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Main Layout: Cards & Strategy Panel */}
            <div className="grid gap-4 xl:grid-cols-[1fr_300px] shrink-0 min-h-0">
                <HealthSummaryCards
                    summary={summary}
                    quotaAvailableCount={quotaStatusCounts.available ?? 0}
                    quotaUnknownCount={quotaStatusCounts.unknown ?? 0}
                />
                <StrategyPanel
                    summary={summary}
                    blockedRowsCount={blockedRows.length}
                    coolingRowsCount={summary?.cooling_down_count ?? 0}
                    worstHealthRow={worstHealthRow}
                    mostLoadedRow={mostLoadedRow}
                    rangeLabel={rangeLabel}
                />
            </div>

            {/* Charts & Visualization Section */}
            <div className="shrink-0">
                <HealthCharts
                    rows={rows}
                    summary={summary}
                    blockedRows={blockedRows}
                    topBlockedReasons={topBlockedReasons}
                    rangeLabel={rangeLabel}
                    worstHealthRow={worstHealthRow}
                />
            </div>

            {/* Quota Filtering Horizontal Toolbar */}
            <div className="flex flex-wrap gap-1.5 shrink-0 py-1 border-t border-border/20">
                <Button
                    variant={quotaStatus === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 rounded-lg text-[10px] font-bold"
                    onClick={() => setQuotaStatus('all')}
                >
                    {t('quota.all')}
                    <span className="ml-1.5 font-mono text-[9px] px-1 bg-background/25 rounded-md">{summary?.total_rows ?? 0}</span>
                </Button>
                {quotaStatusChips.map((status) => (
                    <Button
                        key={status}
                        variant={quotaStatus === status ? 'default' : 'outline'}
                        size="sm"
                        className={cn('h-7 rounded-lg text-[10px] font-bold', quotaStatus !== status && quotaTone(status))}
                        onClick={() => setQuotaStatus(status)}
                    >
                        {quotaLabel(t, status)}
                        <span className="ml-1.5 font-mono text-[9px] px-1 bg-background/25 rounded-md">{quotaStatusCounts[status]}</span>
                    </Button>
                ))}
            </div>

            {/* Table Section */}
            <div className="flex-1 min-h-[300px] flex flex-col overflow-hidden">
                <HealthTable
                    rows={rows}
                    isLoading={isLoading}
                    error={error}
                    totalRowsCount={summary?.request_rows ?? 0}
                />
            </div>
        </div>
    );
}
export default ModelHealth;
