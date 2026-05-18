import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { AttemptStatus, RelayLogWSMode, RelayLogWSRecovery } from './log';

export interface RequestTrace {
    id: number;
    trace_id: string;
    relay_log_id: number;
    thread_id?: string;
    client_api_key_id?: number;
    group_id?: number;
    client_model: string;
    request_source?: string;
    request_stream?: boolean;
    client_ip?: string;
    final_status?: string;
    final_channel_id?: number;
    final_site_id?: number;
    final_upstream_model?: string;
    attempts_count?: number;
    total_latency_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_tokens?: number;
    estimated_cost?: number;
    final_success_cost?: number;
    total_attempt_cost?: number;
    failed_attempt_estimated_cost?: number;
    service_tier?: string;
    used_ws?: boolean;
    ws_mode?: RelayLogWSMode | string;
    ws_recovery?: RelayLogWSRecovery | string;
    created_at: number;
}

export interface RequestAttempt {
    id: number;
    trace_id: string;
    relay_log_id: number;
    attempt_index?: number;
    attempt_num?: number;
    channel_id?: number;
    channel_key_id?: number;
    key_id?: number;
    channel_name?: string;
    site_id?: number;
    site_account_id?: number;
    account_id?: number;
    base_url?: string;
    model_name?: string;
    upstream_model?: string;
    request_protocol?: string;
    upstream_protocol?: string;
    response_protocol?: string;
    status?: AttemptStatus;
    http_status?: number;
    failure_reason?: string;
    retryable?: boolean;
    duration_ms?: number;
    ttfb_ms?: number;
    total_ms?: number;
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
    sticky?: boolean;
    created_at: number;
}

export interface RequestTraceListParams {
    page?: number;
    page_size?: number;
    start_time?: number;
    end_time?: number;
    time_range?: string;
    channel_ids?: string;
    model?: string;
    trace_id?: string;
    api_key_id?: number;
    status?: string;
    http_status?: string;
    failure_reason?: string;
    protocol?: string;
    source?: string;
    stream?: boolean;
    failover?: boolean;
    sort_by?: string;
    sort_order?: string;
}

export type RequestTraceFilters = Omit<RequestTraceListParams, 'page' | 'page_size'>;

export interface RequestTraceListResponse {
    items: RequestTrace[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
}

export interface RequestTraceAuditBucket {
    key: string;
    count: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_tokens?: number;
    total_tokens?: number;
    cost?: number;
    avg_latency_ms?: number;
}

export interface RequestTraceAuditSummary {
    total: number;
    success: number;
    failed: number;
    failover: number;
    stream: number;
    avg_attempts: number;
    avg_latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    cache_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    final_success_cost: number;
    total_attempt_cost: number;
    failed_attempt_estimated_cost: number;
    cost: number;
    status_buckets?: RequestTraceAuditBucket[];
    source_buckets?: RequestTraceAuditBucket[];
    model_buckets?: RequestTraceAuditBucket[];
    service_tier_buckets?: RequestTraceAuditBucket[];
}

export interface RequestTraceDetail {
    trace: RequestTrace;
    attempts: RequestAttempt[];
}

function cleanTraceParams(params: RequestTraceListParams): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        out[key] = value as string | number | boolean;
    }
    return out;
}

export function useRequestTraces(params: RequestTraceListParams = {}, options: { refetchIntervalMs?: number | false } = {}) {
    const cleanParams = cleanTraceParams(params);
    const { refetchIntervalMs = false } = options;

    return useQuery({
        queryKey: ['request-traces', cleanParams],
        queryFn: async () => apiClient.get<RequestTraceListResponse>('/api/v1/log/traces', cleanParams),
        refetchInterval: refetchIntervalMs,
        refetchIntervalInBackground: false,
        staleTime: 0,
    });
}

export function useRequestTraceAudit(params: RequestTraceListParams = {}, options: { refetchIntervalMs?: number | false } = {}) {
    const cleanParams = cleanTraceParams(params);
    const { refetchIntervalMs = false } = options;

    return useQuery({
        queryKey: ['request-traces', 'audit', cleanParams],
        queryFn: async () => apiClient.get<RequestTraceAuditSummary>('/api/v1/log/traces/audit', cleanParams),
        refetchInterval: refetchIntervalMs,
        refetchIntervalInBackground: false,
        staleTime: 0,
    });
}

export function useRequestTraceDetail(traceId: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ['request-traces', 'detail', traceId],
        queryFn: async () => {
            if (!traceId) throw new Error('missing trace id');
            return apiClient.get<RequestTraceDetail>(`/api/v1/log/traces/${encodeURIComponent(traceId)}`);
        },
        enabled: enabled && !!traceId,
        staleTime: 30000,
    });
}
