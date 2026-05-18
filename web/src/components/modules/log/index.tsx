'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ActiveRequestEvent, type ActiveRequestSnapshot, type LogListFilters, useActiveRequests, useLogs } from '@/api/endpoints/log';
import { LogCard, type LogSiteActionTarget, type LogSiteActionTargets } from './Item';
import { Activity, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { VirtualizedGrid } from '@/components/common/VirtualizedGrid';
import { useChannelList } from '@/api/endpoints/channel';
import { useSiteChannelList } from '@/api/endpoints/site-channel';
import { useNavStore } from '@/components/modules/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type ManagedChannelLookup = {
    name: string;
    managed_source?: {
        site_id: number;
        site_account_id: number;
        group_key: string;
    } | null;
};

function getBaseGroupKey(groupKey: string) {
    return groupKey.split('::', 1)[0] || groupKey;
}

function resolveLogChannelId(log: { channel: number; attempts?: Array<{ channel_id: number }> }) {
    if (log.channel) return log.channel;
    if (!log.attempts?.length) return 0;

    for (let index = log.attempts.length - 1; index >= 0; index -= 1) {
        const channelId = log.attempts[index]?.channel_id ?? 0;
        if (channelId) return channelId;
    }

    return 0;
}

function resolveLogModelName(log: { actual_model_name: string; request_model_name: string }) {
    return log.actual_model_name.trim() || log.request_model_name.trim();
}

function resolveLogSiteActionTarget(
    channelId: number,
    modelName: string,
    managedChannelMap: ReadonlyMap<number, ManagedChannelLookup>,
    siteChannelsData: ReturnType<typeof useSiteChannelList>['data'],
): LogSiteActionTarget | null {
    const normalizedModelName = modelName.trim();
    if (!channelId || !normalizedModelName) return null;

    const channel = managedChannelMap.get(channelId);
    if (!channel?.managed_source) return null;

    const source = channel.managed_source;
    const baseGroupKey = getBaseGroupKey(source.group_key);
    const card = siteChannelsData?.find((item) => item.site_id === source.site_id) ?? null;
    const account = card?.accounts.find((item) => item.account_id === source.site_account_id) ?? null;

    let matchedGroup = account?.groups.find(
        (group) =>
            group.group_key === baseGroupKey &&
            group.models.some((model) => model.model_name === normalizedModelName),
    ) ?? null;

    let matchedModel = matchedGroup?.models.find((model) => model.model_name === normalizedModelName) ?? null;

    if (!matchedGroup && account) {
        const candidates = account.groups.flatMap((group) =>
            group.models
                .filter((model) => model.model_name === normalizedModelName)
                .map((model) => ({ group, model })),
        );

        if (candidates.length === 1) {
            matchedGroup = candidates[0].group;
            matchedModel = candidates[0].model;
        }
    }

    if (!matchedGroup || !matchedModel) return null;

    return {
        siteId: source.site_id,
        siteName: card?.site_name ?? `站点 #${source.site_id}`,
        accountId: source.site_account_id,
        accountName: account?.account_name ?? `账号 #${source.site_account_id}`,
        groupKey: matchedGroup.group_key,
        groupName: matchedGroup.group_name,
        modelName: matchedModel.model_name,
        modelDisabled: matchedModel.disabled,
        canDisableModel: true,
        channelId,
        channelName: channel.name,
    };
}

function optionalBoolean(value: string): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function nonAll(value: string) {
    return value && value !== 'all' ? value : undefined;
}

function LogTableHeader() {
    return (
        <div className="hidden lg:grid grid-cols-[1.05fr_1.6fr_1.2fr_0.8fr_0.8fr_0.75fr_0.85fr_1fr_0.9fr_0.55fr] gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>时间 / Trace / 来源</span>
            <span>模型</span>
            <span>渠道 / 协议</span>
            <span>状态</span>
            <span>HTTP</span>
            <span>TTFB</span>
            <span>耗时 / Tok/s</span>
            <span>Token / 缓存</span>
            <span>成本</span>
            <span>尝试</span>
        </div>
    );
}

function formatElapsed(ms: number | undefined) {
    const value = Math.max(0, ms ?? 0);
    if (value < 1000) return `${value}ms`;
    if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
    return `${Math.floor(value / 60000)}m ${Math.floor((value % 60000) / 1000)}s`;
}

function formatActiveMeta(item: ActiveRequestSnapshot) {
    const parts = [
        item.request_source,
        item.request_stream ? 'stream' : 'non-stream',
        item.used_ws ? 'ws' : '',
        item.first_token_seen ? 'first-token' : '',
        item.written ? 'written' : '',
    ].filter(Boolean);
    return parts.join(' / ') || '-';
}

function formatEventTime(timestamp: number | undefined) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function formatDebugPreview(value: string | undefined) {
    const normalized = value?.replace(/\s+/g, ' ').trim();
    if (!normalized) return '-';
    return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}

function ActiveRequestsPanel({
    items,
    total,
    isFetching,
    isStreamConnected,
    streamError,
    recentEvents,
    onRefresh,
}: {
    items: ActiveRequestSnapshot[];
    total: number;
    isFetching: boolean;
    isStreamConnected: boolean;
    streamError: Error | null;
    recentEvents: ActiveRequestEvent[];
    onRefresh: () => void;
}) {
    const t = useTranslations('log.active');
    const visibleItems = items.slice(0, 4);
    const visibleEvents = recentEvents.slice(0, 5);

    return (
        <div className="rounded-md border bg-background/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="size-4 text-primary" />
                    {t('title')}
                </div>
                <Badge variant={total > 0 ? 'secondary' : 'outline'} className="h-6 rounded-md px-2 text-xs">
                    {t('count', { count: total })}
                </Badge>
                <Badge variant={isStreamConnected ? 'secondary' : 'outline'} className="h-6 rounded-md px-2 text-xs">
                    {isStreamConnected ? t('eventStream.connected') : t('eventStream.disconnected')}
                </Badge>
                {streamError ? (
                    <Badge variant="outline" className="h-6 rounded-md border-destructive/30 px-2 text-xs text-destructive">
                        {t('eventStream.fallback')}
                    </Badge>
                ) : null}
                <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 rounded-md px-2 text-xs" onClick={onRefresh}>
                    {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    {t('refresh')}
                </Button>
            </div>
            {visibleItems.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    {t('empty')}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] text-left text-xs">
                        <thead className="text-muted-foreground">
                            <tr className="border-b">
                                <th className="py-1.5 pr-3 font-medium">{t('columns.request')}</th>
                                <th className="py-1.5 pr-3 font-medium">{t('columns.phase')}</th>
                                <th className="py-1.5 pr-3 font-medium">{t('columns.route')}</th>
                                <th className="py-1.5 pr-3 font-medium">{t('columns.status')}</th>
                                <th className="py-1.5 pr-3 font-medium">{t('columns.preview')}</th>
                                <th className="py-1.5 pr-3 font-medium text-right">{t('columns.elapsed')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleItems.map((item) => (
                                <tr key={item.id} className="border-b last:border-0">
                                    <td className="max-w-[220px] py-2 pr-3">
                                        <div className="truncate font-medium" title={item.request_model}>{item.request_model || '-'}</div>
                                        <div className="truncate text-muted-foreground" title={formatActiveMeta(item)}>
                                            {formatActiveMeta(item)}
                                        </div>
                                    </td>
                                    <td className="py-2 pr-3">
                                        <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                                            {item.phase || '-'}
                                        </Badge>
                                    </td>
                                    <td className="max-w-[260px] py-2 pr-3">
                                        <div className="truncate" title={item.channel_name || undefined}>
                                            {item.channel_name || `#${item.channel_id || 0}`} / {item.model_name || '-'}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {t('keySite', {
                                                key: item.channel_key_id || 0,
                                                site: item.site_id || 0,
                                                account: item.site_account_id || 0,
                                            })}
                                        </div>
                                    </td>
                                    <td className="max-w-[240px] py-2 pr-3">
                                        <div className="truncate" title={item.last_failure_reason || undefined}>
                                            {item.last_status || '-'} {item.last_http_status ? `/ ${item.last_http_status}` : ''}
                                        </div>
                                        <div className="truncate text-muted-foreground" title={item.last_failure_reason || undefined}>
                                            {item.last_failure_reason || t('noFailure')}
                                        </div>
                                    </td>
                                    <td className="max-w-[280px] py-2 pr-3 font-mono text-[11px]">
                                        <div className="truncate" title={item.request_preview || undefined}>
                                            <span className="text-muted-foreground">{t('requestPreview')} </span>
                                            {formatDebugPreview(item.request_preview)}
                                        </div>
                                        <div className="truncate text-muted-foreground" title={item.response_preview || undefined}>
                                            {t('responsePreview')} {formatDebugPreview(item.response_preview)}
                                        </div>
                                    </td>
                                    <td className="py-2 text-right font-mono tabular-nums">
                                        {formatElapsed(item.elapsed_ms)}
                                        <div className="text-muted-foreground">{t('attempts', { count: item.attempts_count || 0 })}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="mt-3 border-t pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">{t('events.title')}</div>
                    <div className="text-[11px] text-muted-foreground">{t('events.limit')}</div>
                </div>
                {visibleEvents.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        {t('events.empty')}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[960px] text-left text-xs">
                            <tbody>
                                {visibleEvents.map((event, index) => {
                                    const snapshot = event.snapshot;
                                    const route = snapshot
                                        ? `${snapshot.channel_name || `#${snapshot.channel_id || 0}`} / ${snapshot.model_name || '-'}`
                                        : t('events.snapshotMeta', { count: event.list?.total ?? 0 });
                                    return (
                                        <tr key={`${event.type}-${event.updated_at}-${snapshot?.id ?? index}`} className="border-b last:border-0">
                                            <td className="w-[96px] py-1.5 pr-3 font-mono text-muted-foreground">
                                                {formatEventTime(event.updated_at)}
                                            </td>
                                            <td className="w-[110px] py-1.5 pr-3">
                                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                                                    {t(`events.types.${event.type}`)}
                                                </Badge>
                                            </td>
                                            <td className="max-w-[220px] py-1.5 pr-3">
                                                <div className="truncate font-medium" title={snapshot?.request_model || undefined}>
                                                    {snapshot?.request_model || t('events.snapshot')}
                                                </div>
                                                <div className="truncate text-muted-foreground" title={snapshot ? formatActiveMeta(snapshot) : undefined}>
                                                    {snapshot ? formatActiveMeta(snapshot) : t('events.snapshot')}
                                                </div>
                                            </td>
                                            <td className="max-w-[240px] py-1.5 pr-3">
                                                <div className="truncate" title={route}>{route}</div>
                                                <div className="truncate text-muted-foreground" title={snapshot?.last_failure_reason || undefined}>
                                                    {snapshot?.last_status || snapshot?.phase || '-'} {snapshot?.last_http_status ? `/ ${snapshot.last_http_status}` : ''}
                                                </div>
                                            </td>
                                            <td className="max-w-[280px] py-1.5 pr-3 font-mono text-[11px] text-muted-foreground">
                                                <div className="truncate" title={snapshot?.request_preview || undefined}>
                                                    {t('requestPreview')} {formatDebugPreview(snapshot?.request_preview)}
                                                </div>
                                                <div className="truncate" title={snapshot?.response_preview || undefined}>
                                                    {t('responsePreview')} {formatDebugPreview(snapshot?.response_preview)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * 日志页面组件
 * - 初始加载 pageSize 条历史日志
 * - SSE 实时推送新日志
 * - 滚动自动加载更多
 */
export function Log() {
    const t = useTranslations('log');
    const [timeRange, setTimeRange] = useState('all');
    const [modelFilter, setModelFilter] = useState('');
    const [traceFilter, setTraceFilter] = useState('');
    const [apiKeyFilter, setApiKeyFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [httpStatusFilter, setHTTPStatusFilter] = useState('');
    const [failureFilter, setFailureFilter] = useState('');
    const [protocolFilter, setProtocolFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [streamFilter, setStreamFilter] = useState('all');
    const [failoverFilter, setFailoverFilter] = useState('all');
    const [cacheFilter, setCacheFilter] = useState('all');
    const [sortBy, setSortBy] = useState('time');
    const [sortOrder, setSortOrder] = useState('desc');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState('10000');
    const [openDetailLogId, setOpenDetailLogId] = useState<number | null>(null);
    const pendingLogTarget = useNavStore((state) => state.pendingLogTarget);
    const clearLogTarget = useNavStore((state) => state.clearLogTarget);
    const { data: channelsData } = useChannelList();
    const { data: siteChannelsData } = useSiteChannelList();
    const {
        data: activeRequests,
        isFetching: isFetchingActiveRequests,
        refetch: refetchActiveRequests,
        isStreamConnected: isActiveRequestStreamConnected,
        streamError: activeRequestStreamError,
        recentEvents: activeRequestEvents,
    } = useActiveRequests({
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
        streamEvents: autoRefresh,
    });

    const filters = useMemo<LogListFilters>(() => ({
        time_range: nonAll(timeRange),
        model: modelFilter.trim() || undefined,
        trace_id: traceFilter.trim() || undefined,
        api_key: apiKeyFilter.trim() || undefined,
        channel_ids: nonAll(channelFilter),
        status: nonAll(statusFilter),
        http_status: httpStatusFilter.trim() || undefined,
        failure_reason: failureFilter.trim() || undefined,
        protocol: nonAll(protocolFilter),
        source: nonAll(sourceFilter),
        stream: optionalBoolean(streamFilter),
        failover: optionalBoolean(failoverFilter),
        cache_hit: optionalBoolean(cacheFilter),
        sort_by: sortBy,
        sort_order: sortOrder,
    }), [
        apiKeyFilter,
        cacheFilter,
        channelFilter,
        failoverFilter,
        failureFilter,
        httpStatusFilter,
        modelFilter,
        protocolFilter,
        sortBy,
        sortOrder,
        sourceFilter,
        statusFilter,
        streamFilter,
        timeRange,
        traceFilter,
    ]);

    const {
        logs,
        total,
        hasMore,
        isLoading,
        isFetching,
        isLoadingMore,
        loadMore,
        refetch,
        error,
        isConnected,
    } = useLogs({
        pageSize: 20,
        filters,
        autoRefresh,
        refreshIntervalMs: Number(refreshInterval),
        pauseAutoRefresh: openDetailLogId !== null,
    });

    useEffect(() => {
        if (!autoRefresh || openDetailLogId !== null) return;
        void refetch();
        void refetchActiveRequests();
    }, [autoRefresh, refreshInterval, openDetailLogId, refetch, refetchActiveRequests]);

    const managedChannelMap = useMemo(() => {
        const next = new Map<number, ManagedChannelLookup>();
        for (const channel of channelsData ?? []) {
            next.set(channel.raw.id, {
                name: channel.raw.name,
                managed_source: channel.raw.managed_source,
            });
        }
        return next;
    }, [channelsData]);

    const siteActionTargets = useMemo(() => {
        const next = new Map<number, LogSiteActionTargets>();

        for (const log of logs) {
            const fallbackModelName = resolveLogModelName(log);
            const attemptTargets = (log.attempts ?? []).map((attempt) =>
                resolveLogSiteActionTarget(
                    attempt.channel_id,
                    attempt.model_name?.trim() || fallbackModelName,
                    managedChannelMap,
                    siteChannelsData,
                ),
            );

            const legacyErrorTarget = log.error
                ? resolveLogSiteActionTarget(
                    resolveLogChannelId(log),
                    fallbackModelName,
                    managedChannelMap,
                    siteChannelsData,
                )
                : null;

            if (!attemptTargets.some(Boolean) && !legacyErrorTarget) continue;

            next.set(log.id, {
                attemptTargets,
                legacyErrorTarget,
            });
        }

        return next;
    }, [logs, managedChannelMap, siteChannelsData]);

    const canLoadMore = hasMore && !isLoading && !isLoadingMore && logs.length > 0;
    const handleReachEnd = useCallback(() => {
        if (!canLoadMore) return;
        void loadMore();
    }, [canLoadMore, loadMore]);

    const resetFilters = useCallback(() => {
        setTimeRange('all');
        setModelFilter('');
        setTraceFilter('');
        setApiKeyFilter('');
        setChannelFilter('all');
        setStatusFilter('all');
        setHTTPStatusFilter('');
        setFailureFilter('');
        setProtocolFilter('all');
        setSourceFilter('all');
        setStreamFilter('all');
        setFailoverFilter('all');
        setCacheFilter('all');
        setSortBy('time');
        setSortOrder('desc');
    }, []);

    const handleLogDialogOpenChange = useCallback((logId: number, open: boolean) => {
        setOpenDetailLogId((current) => {
            if (open) return logId;
            return current === logId ? null : current;
        });
    }, []);

    useEffect(() => {
        if (!pendingLogTarget) return;
        const timer = window.setTimeout(() => {
            if (pendingLogTarget.traceId) {
                setTraceFilter(pendingLogTarget.traceId);
            }
            if (pendingLogTarget.source) {
                setSourceFilter(pendingLogTarget.source);
            }
            if (pendingLogTarget.logId) {
                setOpenDetailLogId(pendingLogTarget.logId);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [pendingLogTarget]);

    const pendingAutoOpenLogId = useMemo(() => {
        if (!pendingLogTarget) return 0;
        if (pendingLogTarget.logId) return pendingLogTarget.logId;
        if (!pendingLogTarget.traceId) return 0;
        return logs.find((log) => log.trace_id === pendingLogTarget.traceId)?.id ?? 0;
    }, [logs, pendingLogTarget]);

    const pendingAutoOpenToken = pendingLogTarget && pendingAutoOpenLogId
        ? `${pendingAutoOpenLogId}:${pendingLogTarget.nonce}`
        : '';

    const handlePendingLogTargetConsumed = useCallback(() => {
        if (!pendingLogTarget) return;
        clearLogTarget(pendingLogTarget.nonce);
    }, [clearLogTarget, pendingLogTarget]);

    const footer = useMemo(() => {
        if (hasMore && (isLoading || isLoadingMore)) {
            return (
                <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            );
        }
        if (!hasMore && logs.length > 0) {
            return (
                <div className="flex justify-center py-4">
                    <span className="text-sm text-muted-foreground">{t('list.noMore')}</span>
                </div>
            );
        }
        return null;
    }, [hasMore, isLoading, isLoadingMore, logs.length, t]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="shrink-0 rounded-lg border bg-card p-3">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isConnected ? 'secondary' : 'outline'} className="h-8 px-2">
                            {isConnected ? 'SSE 已连接' : 'SSE 未连接'}
                        </Badge>
                        <Badge variant="outline" className="h-8 px-2">
                            {total} 条
                        </Badge>
                        {error ? (
                            <Badge variant="outline" className="h-8 border-destructive/30 px-2 text-destructive">
                                {error.message}
                            </Badge>
                        ) : null}
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                                <span className="text-sm text-muted-foreground">实时刷新</span>
                            </div>
                            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                                <SelectTrigger size="sm" className="w-[92px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5000">5 秒</SelectItem>
                                    <SelectItem value="10000">10 秒</SelectItem>
                                    <SelectItem value="30000">30 秒</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                                {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                                刷新
                            </Button>
                        </div>
                    </div>

                    <ActiveRequestsPanel
                        items={activeRequests?.items ?? []}
                        total={activeRequests?.total ?? 0}
                        isFetching={isFetchingActiveRequests}
                        isStreamConnected={autoRefresh && isActiveRequestStreamConnected}
                        streamError={autoRefresh ? activeRequestStreamError : null}
                        recentEvents={autoRefresh ? activeRequestEvents : []}
                        onRefresh={() => void refetchActiveRequests()}
                    />

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="模型 / 上游模型" className="pl-8" />
                        </div>
                        <Input value={traceFilter} onChange={(event) => setTraceFilter(event.target.value)} placeholder="Trace ID / Request ID" />
                        <Input value={apiKeyFilter} onChange={(event) => setApiKeyFilter(event.target.value)} placeholder="API Key 名称或 ID" />
                        <Input value={failureFilter} onChange={(event) => setFailureFilter(event.target.value)} placeholder="失败原因" />
                        <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部时间</SelectItem>
                                <SelectItem value="1h">近 1 小时</SelectItem>
                                <SelectItem value="24h">近 24 小时</SelectItem>
                                <SelectItem value="7d">近 7 天</SelectItem>
                                <SelectItem value="30d">近 30 天</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={channelFilter} onValueChange={setChannelFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部渠道</SelectItem>
                                {(channelsData ?? []).map((channel) => (
                                    <SelectItem key={channel.raw.id} value={String(channel.raw.id)}>
                                        {channel.raw.name} #{channel.raw.id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="success">成功</SelectItem>
                                <SelectItem value="failed">失败</SelectItem>
                                <SelectItem value="canceled">已取消</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input value={httpStatusFilter} onChange={(event) => setHTTPStatusFilter(event.target.value)} placeholder="HTTP，如 200 / 429 / 5xx" />
                        <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部协议</SelectItem>
                                <SelectItem value="openai_chat">OpenAI Chat</SelectItem>
                                <SelectItem value="openai_responses">OpenAI Responses</SelectItem>
                                <SelectItem value="anthropic">Anthropic</SelectItem>
                                <SelectItem value="gemini">Gemini</SelectItem>
                                <SelectItem value="ws">WebSocket</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部来源</SelectItem>
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
                                <SelectItem value="all">全部模式</SelectItem>
                                <SelectItem value="true">流式</SelectItem>
                                <SelectItem value="false">非流式</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={failoverFilter} onValueChange={setFailoverFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部链路</SelectItem>
                                <SelectItem value="true">发生故障转移</SelectItem>
                                <SelectItem value="false">未故障转移</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={cacheFilter} onValueChange={setCacheFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部缓存</SelectItem>
                                <SelectItem value="true">命中缓存</SelectItem>
                                <SelectItem value="false">未命中缓存</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="time">按时间</SelectItem>
                                    <SelectItem value="duration">按耗时</SelectItem>
                                    <SelectItem value="ttfb">按 TTFB</SelectItem>
                                    <SelectItem value="cost">按成本</SelectItem>
                                    <SelectItem value="tokens">按 Token</SelectItem>
                                    <SelectItem value="attempts">按尝试数</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sortOrder} onValueChange={setSortOrder}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="desc">降序</SelectItem>
                                    <SelectItem value="asc">升序</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={resetFilters}>
                            <X className="size-4" />
                            重置筛选
                        </Button>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1">
                <VirtualizedGrid
                    items={logs}
                    layout="list"
                    columns={{ default: 1 }}
                    estimateItemHeight={72}
                    overscan={8}
                    getItemKey={(log) => `log-${log.id}`}
                    renderItem={(log) => (
                        <LogCard
                            log={log}
                            siteTargets={siteActionTargets.get(log.id) ?? null}
                            variant="row"
                            autoOpenToken={log.id === pendingAutoOpenLogId ? pendingAutoOpenToken : undefined}
                            onAutoOpenConsumed={log.id === pendingAutoOpenLogId ? handlePendingLogTargetConsumed : undefined}
                            onDialogOpenChange={(open) => handleLogDialogOpenChange(log.id, open)}
                        />
                    )}
                    header={<LogTableHeader />}
                    footer={footer}
                    onReachEnd={handleReachEnd}
                    reachEndEnabled={canLoadMore}
                    reachEndOffset={2}
                />
            </div>
        </div>
    );
}
