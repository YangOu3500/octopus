'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
    useLogs,
    useActiveRequests,
    useClearLogs,
    type LogListFilters,
    type RelayLog,
    type ActiveRequestSnapshot,
    type ActiveRequestEvent,
    type ChannelAttempt,
} from '@/api/endpoints/log';
import {
    PAGE_SIZE,
    LOG_EXPORT_VERSION,
    ACTIVE_DEBUG_EXPORT_VERSION,
    downloadJson,
    compactObject,
    formatClientIP,
    sanitizeBaseURLForExport,
    sanitizeLogExportText,
} from './log-utils';

function sanitizeActiveSnapshot(snapshot: ActiveRequestSnapshot | undefined) {
    if (!snapshot) return undefined;
    return {
        id: snapshot.id,
        api_key_id: snapshot.api_key_id,
        group_id: snapshot.group_id,
        request_model: snapshot.request_model,
        request_source: snapshot.request_source,
        request_stream: snapshot.request_stream,
        client_ip: formatClientIP(snapshot.client_ip),
        started_at: snapshot.started_at,
        updated_at: snapshot.updated_at,
        elapsed_ms: snapshot.elapsed_ms,
        phase: snapshot.phase,
        channel_id: snapshot.channel_id,
        channel_name: snapshot.channel_name,
        channel_key_id: snapshot.channel_key_id,
        model_name: snapshot.model_name,
        site_id: snapshot.site_id,
        site_account_id: snapshot.site_account_id,
        quota_status: snapshot.quota_status,
        quota_reason: snapshot.quota_reason,
        capacity_status: snapshot.capacity_status,
        capacity_reason: snapshot.capacity_reason,
        capacity_scope: snapshot.capacity_scope,
        capacity_source: snapshot.capacity_source,
        last_observed_at: snapshot.last_observed_at,
        expires_at: snapshot.expires_at,
        channel_concurrency_mode: snapshot.channel_concurrency_mode,
        channel_concurrency_limit: snapshot.channel_concurrency_limit,
        channel_concurrency_wait_ms: snapshot.channel_concurrency_wait_ms,
        channel_concurrency_acquired: snapshot.channel_concurrency_acquired,
        channel_concurrency_timed_out: snapshot.channel_concurrency_timed_out,
        attempts_count: snapshot.attempts_count,
        last_status: snapshot.last_status,
        last_http_status: snapshot.last_http_status,
        last_failure_reason: snapshot.last_failure_reason,
        request_preview: snapshot.request_preview,
        response_preview: snapshot.response_preview,
        written: snapshot.written,
        first_token_seen: snapshot.first_token_seen,
        used_ws: snapshot.used_ws,
    };
}

function sanitizeLogAttemptForExport(attempt: ChannelAttempt, index: number) {
    return {
        attempt_num: attempt.attempt_num,
        attempt_index: attempt.attempt_index ?? attempt.attempt_num ?? index + 1,
        channel_id: attempt.channel_id,
        channel_name: attempt.channel_name,
        channel_key_id: attempt.channel_key_id ?? attempt.key_id,
        site_id: attempt.site_id,
        site_account_id: attempt.site_account_id ?? attempt.account_id,
        base_url: sanitizeBaseURLForExport(attempt.base_url),
        model_name: attempt.model_name,
        upstream_model: attempt.upstream_model,
        request_protocol: attempt.request_protocol,
        upstream_protocol: attempt.upstream_protocol,
        response_protocol: attempt.response_protocol,
        status: attempt.status,
        http_status: attempt.http_status,
        failure_reason: attempt.failure_reason,
        retryable: attempt.retryable,
        quota_status: attempt.quota_status,
        quota_reason: attempt.quota_reason,
        capacity_status: attempt.capacity_status,
        capacity_reason: attempt.capacity_reason,
        capacity_scope: attempt.capacity_scope,
        capacity_source: attempt.capacity_source,
        last_observed_at: attempt.last_observed_at,
        expires_at: attempt.expires_at,
        duration_ms: attempt.duration_ms ?? attempt.duration,
        ttfb_ms: attempt.ttfb_ms,
        total_ms: attempt.total_ms,
        input_tokens: attempt.input_tokens,
        output_tokens: attempt.output_tokens,
        cache_tokens: attempt.cache_tokens,
        input_cost: attempt.input_cost,
        output_cost: attempt.output_cost,
        estimated_cost: attempt.estimated_cost,
        cost_incurred: attempt.cost_incurred,
        cost_source: attempt.cost_source,
        service_tier: attempt.service_tier,
        channel_concurrency_mode: attempt.channel_concurrency_mode,
        channel_concurrency_limit: attempt.channel_concurrency_limit,
        channel_concurrency_wait_ms: attempt.channel_concurrency_wait_ms,
        channel_concurrency_acquired: attempt.channel_concurrency_acquired,
        channel_concurrency_timed_out: attempt.channel_concurrency_timed_out,
        sticky: attempt.sticky,
        created_at: attempt.created_at,
        error_summary: sanitizeLogExportText(attempt.error_summary || attempt.msg, 500),
    };
}

function sanitizeLogForListExport(log: RelayLog) {
    return {
        id: log.id,
        trace_id: log.trace_id,
        thread_id: log.thread_id,
        client_api_key_id: log.client_api_key_id,
        group_id: log.group_id,
        time: log.time,
        request: {
            model_name: log.request_model_name,
            stream: log.request_stream,
            source: log.request_source,
            client_ip: formatClientIP(log.client_ip),
        },
        route: {
            channel_id: log.channel,
            channel_name: log.channel_name,
            actual_model_name: log.actual_model_name,
            final_status: log.final_status,
            final_channel_id: log.final_channel_id,
            final_site_id: log.final_site_id,
            final_upstream_model: log.final_upstream_model,
        },
        latency: {
            total_latency_ms: log.total_latency_ms,
            first_token_ms: log.ftut,
            use_time_ms: log.use_time,
        },
        usage: {
            input_tokens: log.input_tokens,
            transport_input_tokens: log.transport_input_tokens,
            bill_input_tokens: log.bill_input_tokens,
            cache_read_tokens: log.cache_read_tokens,
            cache_write_tokens: log.cache_write_tokens,
            cache_tokens: log.cache_tokens,
            output_tokens: log.output_tokens,
        },
        cost: {
            cost: log.cost,
            estimated_cost: log.estimated_cost,
            final_success_cost: log.final_success_cost,
            total_attempt_cost: log.total_attempt_cost,
            failed_attempt_estimated_cost: log.failed_attempt_estimated_cost,
        },
        service_tier: log.service_tier,
        websocket: {
            used: log.used_ws,
            mode: log.ws_mode,
            recovery: log.ws_recovery,
        },
        attempts_count: log.attempts_count ?? log.total_attempts ?? log.attempts?.length ?? 0,
        total_attempts: log.total_attempts,
        error: sanitizeLogExportText(log.error, 500),
        attempts: log.attempts?.map(sanitizeLogAttemptForExport) ?? [],
    };
}

export function useLogState() {
    const t = useTranslations('log');

    const [timeRange, setTimeRange] = useState('24h');
    const [modelFilter, setModelFilter] = useState('');
    const [traceFilter, setTraceFilter] = useState('');
    const [apiKeyFilter, setApiKeyFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [httpStatusFilter, setHttpStatusFilter] = useState('');
    const [failureFilter, setFailureFilter] = useState('');
    const [protocolFilter, setProtocolFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [streamFilter, setStreamFilter] = useState('all');
    const [failoverFilter, setFailoverFilter] = useState('all');
    const [cacheHitFilter, setCacheHitFilter] = useState('all');

    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState('10000');
    const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
    const [activeDebugOpen, setActiveDebugOpen] = useState(false);

    const nonAll = (val: string) => (val && val !== 'all' ? val : undefined);
    const optionalBoolean = (val: string) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
    };

    const filters = useMemo<LogListFilters>(() => ({
        time_range: nonAll(timeRange),
        model: modelFilter.trim() || undefined,
        trace_id: traceFilter.trim() || undefined,
        api_key: apiKeyFilter.trim() || undefined,
        status: nonAll(statusFilter),
        http_status: httpStatusFilter.trim() || undefined,
        failure_reason: failureFilter.trim() || undefined,
        protocol: nonAll(protocolFilter),
        source: nonAll(sourceFilter),
        stream: optionalBoolean(streamFilter),
        failover: optionalBoolean(failoverFilter),
        cache_hit: optionalBoolean(cacheHitFilter),
        sort_by: 'time',
        sort_order: 'desc',
    }), [
        timeRange,
        modelFilter,
        traceFilter,
        apiKeyFilter,
        statusFilter,
        httpStatusFilter,
        failureFilter,
        protocolFilter,
        sourceFilter,
        streamFilter,
        failoverFilter,
        cacheHitFilter,
    ]);

    const logsQuery = useLogs({
        pageSize: PAGE_SIZE,
        filters,
        autoRefresh,
        refreshIntervalMs: Number(refreshInterval),
    });

    const activeRequestsQuery = useActiveRequests({
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
        streamEvents: activeDebugOpen,
    });

    const clearLogsMutation = useClearLogs();

    const resetFilters = useCallback(() => {
        setTimeRange('24h');
        setModelFilter('');
        setTraceFilter('');
        setApiKeyFilter('');
        setStatusFilter('all');
        setHttpStatusFilter('');
        setFailureFilter('');
        setProtocolFilter('all');
        setSourceFilter('all');
        setStreamFilter('all');
        setFailoverFilter('all');
        setCacheHitFilter('all');
        setSelectedLogId(null);
    }, []);

    const handleExportPage = useCallback(() => {
        if (logsQuery.logs.length === 0) {
            toast.warning(t('list.export.empty'));
            return;
        }

        try {
            downloadJson(`octopus-logs-export-${new Date().getTime()}.json`, {
                export_version: LOG_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                safety: {
                    content: 'loaded_log_list_structured_fields',
                    scope: 'currently loaded rows only',
                    excludes: ['request body', 'response body', 'api key name', 'full api key', 'cookie', 'authorization', 'bearer token'],
                },
                scope: {
                    loaded_count: logsQuery.logs.length,
                    matched_total: logsQuery.total,
                    filters: compactObject({
                        ...filters,
                        api_key: filters.api_key ? 'PRESENT' : undefined,
                    }),
                },
                items: logsQuery.logs.map(sanitizeLogForListExport),
            });
            toast.success(t('list.export.success'), { description: t('list.export.safe') });
        } catch (error) {
            toast.error(t('list.export.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    }, [logsQuery.logs, logsQuery.total, filters, t]);

    const handleExportActiveDebug = useCallback(() => {
        const items = activeRequestsQuery.data?.items ?? [];
        const total = activeRequestsQuery.data?.total ?? 0;
        const recentEvents = activeRequestsQuery.recentEvents;
        const isStreamConnected = activeRequestsQuery.isStreamConnected;

        if (items.length === 0 && recentEvents.length === 0) {
            toast.warning(t('active.export.empty'));
            return;
        }

        try {
            downloadJson(`octopus-active-debug-${new Date().getTime()}.json`, {
                export_version: ACTIVE_DEBUG_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                safety: {
                    content: 'server_redacted_active_request_debug_snapshot',
                    excludes: ['request body', 'response body', 'full api key', 'cookie', 'authorization', 'bearer token'],
                },
                stream_connected: isStreamConnected,
                total,
                items: items.map(sanitizeActiveSnapshot),
                recent_events: recentEvents.map((event: ActiveRequestEvent) => ({
                    type: event.type,
                    updated_at: event.updated_at,
                    snapshot: sanitizeActiveSnapshot(event.snapshot),
                    list_total: event.list?.total,
                })),
            });
            toast.success(t('active.export.success'), { description: t('active.export.safe') });
        } catch (error) {
            toast.error(t('active.export.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    }, [activeRequestsQuery, t]);

    return {
        timeRange,
        setTimeRange,
        modelFilter,
        setModelFilter,
        traceFilter,
        setTraceFilter,
        apiKeyFilter,
        setApiKeyFilter,
        statusFilter,
        setStatusFilter,
        httpStatusFilter,
        setHttpStatusFilter,
        failureFilter,
        setFailureFilter,
        protocolFilter,
        setProtocolFilter,
        sourceFilter,
        setSourceFilter,
        streamFilter,
        setStreamFilter,
        failoverFilter,
        setFailoverFilter,
        cacheHitFilter,
        setCacheHitFilter,
        autoRefresh,
        setAutoRefresh,
        refreshInterval,
        setRefreshInterval,
        selectedLogId,
        setSelectedLogId,
        activeDebugOpen,
        setActiveDebugOpen,
        filters,
        logsQuery,
        activeRequestsQuery,
        clearLogsMutation,
        resetFilters,
        handleExportPage,
        handleExportActiveDebug,
    };
}

export type LogState = ReturnType<typeof useLogState>;
