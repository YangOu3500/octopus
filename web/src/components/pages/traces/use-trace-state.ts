'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
    useRequestTraces,
    useRequestTraceAudit,
    type RequestTraceListParams,
} from '@/api/endpoints/traces';
import {
    nonAll,
    optionalBoolean,
    PAGE_SIZE,
    MAX_COMPARE_TRACES,
    TRACE_EXPORT_VERSION,
    exportFilenameTimestamp,
    exportTimestamp,
    downloadJson,
    sanitizeTraceParamsForExport,
    sanitizeTraceForExport,
} from './trace-utils';

export function useTraceState() {
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
    const [compareTraceIds, setCompareTraceIds] = useState<string[]>([]);

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

    const auditParams = useMemo<RequestTraceListParams>(() => ({
        ...params,
        page: undefined,
        page_size: undefined,
    }), [params]);

    const tracesQuery = useRequestTraces(params, {
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
    });
    
    const auditQuery = useRequestTraceAudit(auditParams, {
        refetchIntervalMs: autoRefresh ? Number(refreshInterval) : false,
    });

    const resetTraceListPosition = useCallback(() => {
        setPage(1);
        setSelectedTraceId(null);
        setCompareTraceIds([]);
    }, []);

    const refetchAll = useCallback(async () => {
        await Promise.all([
            tracesQuery.refetch(),
            auditQuery.refetch(),
        ]);
    }, [tracesQuery, auditQuery]);

    useEffect(() => {
        if (!autoRefresh) return;
        void refetchAll();
    }, [autoRefresh, refreshInterval, refetchAll]);

    const traces = useMemo(() => tracesQuery.data?.items ?? [], [tracesQuery.data?.items]);
    const total = tracesQuery.data?.total ?? 0;

    const visibleCompareTraceIds = useMemo(() => {
        const visibleTraceIds = new Set(traces.map((trace) => trace.trace_id));
        return compareTraceIds.filter((traceId) => visibleTraceIds.has(traceId));
    }, [compareTraceIds, traces]);

    const effectiveSelectedTraceId = useMemo(() => {
        if (selectedTraceId && traces.some((trace) => trace.trace_id === selectedTraceId)) {
            return selectedTraceId;
        }
        return traces[0]?.trace_id ?? null;
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

    const compareTraces = useMemo(() => {
        const selected = new Set(visibleCompareTraceIds);
        return traces.filter((trace) => selected.has(trace.trace_id));
    }, [traces, visibleCompareTraceIds]);

    const handleToggleCompare = useCallback((traceId: string, checked: boolean) => {
        setCompareTraceIds((current) => {
            if (!checked) return current.filter((item) => item !== traceId);
            if (current.includes(traceId)) return current;
            if (current.length >= MAX_COMPARE_TRACES) {
                toast.warning(t('compare.limitReached', { count: MAX_COMPARE_TRACES }));
                return current;
            }
            return [...current, traceId];
        });
    }, [t]);

    const handleClearCompare = useCallback(() => {
        setCompareTraceIds([]);
    }, []);

    const handleRemoveCompare = useCallback((traceId: string) => {
        setCompareTraceIds((current) => current.filter((item) => item !== traceId));
    }, []);

    const handleFocusTrace = useCallback((traceId: string) => {
        setSelectedTraceId(traceId);
    }, []);

    const resetFilters = useCallback(() => {
        resetTraceListPosition();
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
    }, [resetTraceListPosition]);

    const hasMore = tracesQuery.data?.has_more ?? false;
    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleExportPage = useCallback(() => {
        if (traces.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }

        try {
            downloadJson(`octopus-traces-page-${page}-${exportFilenameTimestamp()}.json`, {
                schema: 'octopus.request_traces.page',
                version: TRACE_EXPORT_VERSION,
                exported_at: exportTimestamp(),
                scope: 'current_page',
                filters: sanitizeTraceParamsForExport(params),
                pagination: {
                    page,
                    page_size: PAGE_SIZE,
                    total,
                    max_page: maxPage,
                    has_more: hasMore,
                },
                items: traces.map(sanitizeTraceForExport),
            });
            toast.success(t('export.success'), { description: t('export.safe') });
        } catch (error) {
            toast.error(t('export.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    }, [hasMore, maxPage, page, params, t, total, traces]);

    return {
        page,
        setPage,
        timeRange,
        setTimeRange,
        modelFilter,
        setModelFilter,
        traceFilter,
        setTraceFilter,
        statusFilter,
        setStatusFilter,
        sourceFilter,
        setSourceFilter,
        streamFilter,
        setStreamFilter,
        failoverFilter,
        setFailoverFilter,
        httpStatusFilter,
        setHTTPStatusFilter,
        failureFilter,
        setFailureFilter,
        protocolFilter,
        setProtocolFilter,
        autoRefresh,
        setAutoRefresh,
        refreshInterval,
        setRefreshInterval,
        selectedTraceId,
        setSelectedTraceId,
        compareTraceIds,
        setCompareTraceIds,
        params,
        auditParams,
        tracesQuery,
        auditQuery,
        resetTraceListPosition,
        refetchAll,
        traces,
        total,
        visibleCompareTraceIds,
        effectiveSelectedTraceId,
        summary,
        compareTraces,
        handleToggleCompare,
        handleClearCompare,
        handleRemoveCompare,
        handleFocusTrace,
        resetFilters,
        hasMore,
        maxPage,
        handleExportPage,
    };
}
