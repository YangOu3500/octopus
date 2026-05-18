import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, API_BASE_URL } from '../client';
import { logger } from '@/lib/logger';

export type AttemptStatus = 'success' | 'failed' | 'circuit_break' | 'skipped';

export type RelayLogWSMode = 'fresh' | 'continuation' | 'replay';

export type RelayLogWSRecovery = 'reconnect' | 'replay' | 'downgrade';

export interface ChannelAttempt {
    channel_id: number;
    channel_key_id?: number;
    key_id?: number;
    channel_name: string;
    site_id?: number;
    site_account_id?: number;
    account_id?: number;
    base_url?: string;
    model_name: string;
    upstream_model?: string;
    request_protocol?: string;
    upstream_protocol?: string;
    response_protocol?: string;
    attempt_num: number;
    attempt_index?: number;
    status: AttemptStatus;
    duration: number;
    duration_ms?: number;
    ttfb_ms?: number;
    total_ms?: number;
    http_status?: number;
    failure_reason?: string;
    retryable?: boolean;
    input_tokens?: number;
    output_tokens?: number;
    cache_tokens?: number;
    input_cost?: number;
    output_cost?: number;
    estimated_cost?: number;
    cost_incurred?: string;
    cost_source?: string;
    service_tier?: string;
    error_summary?: string;
    created_at?: number;
    sticky?: boolean;
    msg?: string;
}

export interface RelayLog {
    id: number;
    trace_id?: string;
    thread_id?: string;
    client_api_key_id?: number;
    group_id?: number;
    time: number;
    request_model_name: string;
    request_api_key_name?: string;
    request_stream?: boolean;
    request_source?: string;
    client_ip?: string;
    channel: number;
    channel_name: string;
    actual_model_name: string;
    final_status?: string;
    final_channel_id?: number;
    final_site_id?: number;
    final_upstream_model?: string;
    attempts_count?: number;
    total_latency_ms?: number;
    input_tokens: number;
    transport_input_tokens?: number | null;
    bill_input_tokens?: number | null;
    cache_read_tokens?: number | null;
    cache_write_tokens?: number | null;
    cache_tokens?: number;
    output_tokens: number;
    ftut: number;
    use_time: number;
    cost: number;
    estimated_cost?: number;
    final_success_cost?: number;
    total_attempt_cost?: number;
    failed_attempt_estimated_cost?: number;
    service_tier?: string;
    request_content: string;
    response_content: string;
    error: string;
    attempts?: ChannelAttempt[];
    total_attempts?: number;
    used_ws?: boolean;
    ws_mode?: RelayLogWSMode | null;
    ws_recovery?: RelayLogWSRecovery | null;
}

export interface LogListParams {
    page?: number;
    page_size?: number;
    start_time?: number;
    end_time?: number;
    time_range?: string;
    channel_ids?: string;
    model?: string;
    trace_id?: string;
    api_key?: string;
    api_key_id?: number;
    status?: string;
    http_status?: string;
    failure_reason?: string;
    protocol?: string;
    source?: string;
    stream?: boolean;
    failover?: boolean;
    cache_hit?: boolean;
    sort_by?: string;
    sort_order?: string;
}

export type LogListFilters = Omit<LogListParams, 'page' | 'page_size'>;

export interface LogListResponse {
    items: RelayLog[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
}

export interface ActiveRequestSnapshot {
    id: string;
    api_key_id?: number;
    group_id?: number;
    request_model: string;
    request_source?: string;
    request_stream: boolean;
    client_ip?: string;
    started_at: number;
    updated_at: number;
    elapsed_ms: number;
    phase: string;
    channel_id?: number;
    channel_name?: string;
    channel_key_id?: number;
    model_name?: string;
    site_id?: number;
    site_account_id?: number;
    attempts_count?: number;
    last_status?: string;
    last_http_status?: number;
    last_failure_reason?: string;
    written: boolean;
    first_token_seen: boolean;
    used_ws: boolean;
}

export interface ActiveRequestListResponse {
    total: number;
    updated_at: number;
    items: ActiveRequestSnapshot[];
}

export interface ActiveRequestEvent {
    type: 'snapshot' | 'started' | 'updated' | 'completed';
    updated_at: number;
    snapshot?: ActiveRequestSnapshot;
    list?: ActiveRequestListResponse;
}

const activeRequestsQueryKey = ['logs', 'active'] as const;

function mergeActiveRequestEvent(
    current: ActiveRequestListResponse | undefined,
    event: ActiveRequestEvent,
): ActiveRequestListResponse {
    if (event.type === 'snapshot' && event.list) {
        return event.list;
    }

    const updatedAt = event.updated_at || Date.now();
    const base = current ?? { total: 0, updated_at: updatedAt, items: [] };
    const snapshot = event.snapshot;
    if (!snapshot?.id) {
        return { ...base, updated_at: updatedAt };
    }

    const items = event.type === 'completed'
        ? base.items.filter((item) => item.id !== snapshot.id)
        : [snapshot, ...base.items.filter((item) => item.id !== snapshot.id)];

    items.sort((left, right) => {
        if ((left.elapsed_ms ?? 0) === (right.elapsed_ms ?? 0)) {
            return (left.started_at ?? 0) - (right.started_at ?? 0);
        }
        return (right.elapsed_ms ?? 0) - (left.elapsed_ms ?? 0);
    });

    return {
        total: items.length,
        updated_at: updatedAt,
        items,
    };
}

export function useClearLogs() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            return apiClient.delete<null>('/api/v1/log/clear');
        },
        onSuccess: () => {
            logger.log('relay logs cleared');
            queryClient.invalidateQueries({ queryKey: ['logs'] });
            queryClient.invalidateQueries({ queryKey: ['request-traces'] });
        },
        onError: (error) => {
            logger.error('failed to clear relay logs:', error);
        },
    });
}

export function useLogDetail(logID: number | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ['logs', 'detail', logID],
        queryFn: async () => {
            if (!logID) throw new Error('missing log id');
            return apiClient.get<RelayLog>(`/api/v1/log/detail/${logID}`);
        },
        enabled: enabled && !!logID,
        staleTime: 60000,
    });
}

export function useActiveRequests(options: { refetchIntervalMs?: number | false; streamEvents?: boolean } = {}) {
    const { refetchIntervalMs = false, streamEvents = false } = options;
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);
    const [isStreamConnected, setIsStreamConnected] = useState(false);
    const [streamError, setStreamError] = useState<Error | null>(null);

    const query = useQuery({
        queryKey: activeRequestsQueryKey,
        queryFn: async () => apiClient.get<ActiveRequestListResponse>('/api/v1/log/active'),
        refetchInterval: refetchIntervalMs,
        refetchIntervalInBackground: false,
        staleTime: 1000,
    });

    useEffect(() => {
        if (!streamEvents) {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            return;
        }

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryAttempt = 0;

        const scheduleReconnect = () => {
            if (cancelled) return;
            const delay = Math.min(30000, 1000 * 2 ** retryAttempt);
            retryAttempt += 1;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                connect(true);
            }, delay);
        };

        const connect = async (isReconnect = false) => {
            try {
                const { token } = await apiClient.get<{ token: string }>('/api/v1/log/stream-token');
                if (cancelled) return;

                const eventSource = new EventSource(`${API_BASE_URL}/api/v1/log/active-stream?token=${token}`);
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    retryAttempt = 0;
                    setIsStreamConnected(true);
                    setStreamError(null);
                    if (isReconnect) {
                        queryClient.invalidateQueries({ queryKey: activeRequestsQueryKey });
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const activeEvent: ActiveRequestEvent = JSON.parse(event.data);
                        queryClient.setQueryData(
                            activeRequestsQueryKey,
                            (old: ActiveRequestListResponse | undefined) => mergeActiveRequestEvent(old, activeEvent),
                        );
                    } catch (e) {
                        logger.error('failed to parse active request stream event:', e);
                    }
                };

                eventSource.onerror = () => {
                    setIsStreamConnected(false);
                    setStreamError(new Error('active request stream disconnected'));
                    eventSource.close();
                    eventSourceRef.current = null;
                    scheduleReconnect();
                };
            } catch (e) {
                if (cancelled) return;
                setStreamError(e instanceof Error ? e : new Error('failed to create active request stream'));
                logger.error('failed to create active request stream:', e);
                scheduleReconnect();
            }
        };

        connect(false);

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            setIsStreamConnected(false);
        };
    }, [queryClient, streamEvents]);

    return {
        ...query,
        isStreamConnected,
        streamError,
    };
}

const logsInfiniteQueryKey = (pageSize: number, filters: LogListFilters) => ['logs', 'infinite', pageSize, filters] as const;

function cleanLogFilters(filters: LogListFilters = {}): LogListFilters {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === '') continue;
        out[key] = value as string | number | boolean;
    }
    return out as LogListFilters;
}

function buildLogParams(page: number, pageSize: number, filters: LogListFilters): Record<string, string | number | boolean> {
    return {
        ...filters,
        page,
        page_size: pageSize,
    };
}

function normalizeLogListResponse(result: RelayLog[] | LogListResponse | null | undefined, page: number, pageSize: number): LogListResponse {
    if (Array.isArray(result)) {
        return {
            items: result,
            total: result.length,
            page,
            page_size: pageSize,
            has_more: result.length >= pageSize,
        };
    }
    if (!result) {
        return { items: [], total: 0, page, page_size: pageSize, has_more: false };
    }
    return {
        items: result.items ?? [],
        total: result.total ?? 0,
        page: result.page ?? page,
        page_size: result.page_size ?? pageSize,
        has_more: Boolean(result.has_more),
    };
}

function hasActiveLogFilters(filters: LogListFilters) {
    return Object.entries(filters).some(([key, value]) => {
        if (value === undefined || value === null || value === '') return false;
        if (key === 'sort_by' && value === 'time') return false;
        if (key === 'sort_order' && value === 'desc') return false;
        return true;
    });
}

export function useLogs(options: {
    pageSize?: number;
    filters?: LogListFilters;
    autoRefresh?: boolean;
    refreshIntervalMs?: number;
    pauseAutoRefresh?: boolean;
} = {}) {
    const {
        pageSize = 20,
        filters = {},
        autoRefresh = false,
        refreshIntervalMs = 10000,
        pauseAutoRefresh = false,
    } = options;

    const cleanFilters = useMemo(() => cleanLogFilters(filters), [filters]);
    const activeFilters = useMemo(() => hasActiveLogFilters(cleanFilters), [cleanFilters]);
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const logsQuery = useInfiniteQuery({
        queryKey: logsInfiniteQueryKey(pageSize, cleanFilters),
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const page = Number(pageParam);
            const result = await apiClient.get<RelayLog[] | LogListResponse | null>(
                '/api/v1/log/list',
                buildLogParams(page, pageSize, cleanFilters),
            );
            return normalizeLogListResponse(result, page, pageSize);
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage?.has_more) return undefined;
            return allPages.length + 1;
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: autoRefresh && !pauseAutoRefresh ? refreshIntervalMs : false,
        refetchIntervalInBackground: false,
    });

    const logs = useMemo(() => {
        const pages = logsQuery.data?.pages ?? [];
        const seen = new Set<number>();
        const merged: RelayLog[] = [];

        for (const page of pages) {
            for (const log of page.items) {
                if (seen.has(log.id)) continue;
                seen.add(log.id);
                merged.push(log);
            }
        }

        return merged;
    }, [logsQuery.data]);

    const loadMore = useCallback(async () => {
        if (!logsQuery.hasNextPage || logsQuery.isFetchingNextPage) return;
        try {
            await logsQuery.fetchNextPage();
        } catch (e) {
            logger.error('failed to load more relay logs:', e);
        }
    }, [logsQuery]);

    useEffect(() => {
        if (!autoRefresh || pauseAutoRefresh) {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            return;
        }

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryAttempt = 0;

        const queryKey = logsInfiniteQueryKey(pageSize, cleanFilters);

        const scheduleReconnect = () => {
            if (cancelled) return;
            const delay = Math.min(30000, 1000 * 2 ** retryAttempt);
            retryAttempt += 1;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                connect(true);
            }, delay);
        };

        const connect = async (isReconnect = false) => {
            try {
                const { token } = await apiClient.get<{ token: string }>('/api/v1/log/stream-token');
                if (cancelled) return;

                const eventSource = new EventSource(`${API_BASE_URL}/api/v1/log/stream?token=${token}`);
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    retryAttempt = 0;
                    setIsConnected(true);
                    setError(null);
                    if (isReconnect) {
                        queryClient.invalidateQueries({ queryKey });
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const log: RelayLog = JSON.parse(event.data);
                        if (activeFilters) {
                            queryClient.invalidateQueries({ queryKey });
                            return;
                        }
                        queryClient.setQueryData(
                            queryKey,
                            (old: InfiniteData<LogListResponse, number> | undefined) => {
                                if (!old) {
                                    return {
                                        pages: [{
                                            items: [log],
                                            total: 1,
                                            page: 1,
                                            page_size: pageSize,
                                            has_more: false,
                                        }],
                                        pageParams: [1],
                                    };
                                }

                                const exists = old.pages.some((page) => page.items.some((item) => item.id === log.id));
                                if (exists) return old;

                                const first = old.pages[0] ?? {
                                    items: [],
                                    total: 0,
                                    page: 1,
                                    page_size: pageSize,
                                    has_more: false,
                                };
                                const prepended = [log, ...first.items];
                                if (prepended.length > pageSize && old.pages.length > 1) {
                                    queryClient.invalidateQueries({ queryKey });
                                    return {
                                        ...old,
                                        pages: [
                                            {
                                                ...first,
                                                items: prepended.slice(0, pageSize),
                                                total: first.total + 1,
                                                has_more: true,
                                            },
                                            ...old.pages.slice(1),
                                        ],
                                    };
                                }
                                return {
                                    ...old,
                                    pages: [
                                        {
                                            ...first,
                                            items: prepended,
                                            total: first.total + 1,
                                        },
                                        ...old.pages.slice(1),
                                    ],
                                };
                            },
                        );
                    } catch (e) {
                        logger.error('failed to parse relay log stream event:', e);
                    }
                };

                eventSource.onerror = () => {
                    setIsConnected(false);
                    setError(new Error('relay log stream disconnected'));
                    eventSource.close();
                    eventSourceRef.current = null;
                    scheduleReconnect();
                };
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e : new Error('failed to create relay log stream'));
                logger.error('failed to create relay log stream:', e);
                scheduleReconnect();
            }
        };

        connect(false);

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            setIsConnected(false);
        };
    }, [activeFilters, autoRefresh, cleanFilters, pageSize, pauseAutoRefresh, queryClient]);

    const clear = useCallback(() => {
        queryClient.removeQueries({ queryKey: logsInfiniteQueryKey(pageSize, cleanFilters) });
    }, [cleanFilters, pageSize, queryClient]);

    return {
        logs,
        total: logsQuery.data?.pages[0]?.total ?? 0,
        isConnected,
        error,
        hasMore: !!logsQuery.hasNextPage,
        isLoading: logsQuery.isLoading,
        isFetching: logsQuery.isFetching,
        isLoadingMore: logsQuery.isFetchingNextPage,
        loadMore,
        refetch: logsQuery.refetch,
        clear,
    };
}
