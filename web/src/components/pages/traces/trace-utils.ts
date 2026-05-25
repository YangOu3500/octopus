'use client';

import type { useTranslations } from 'next-intl';
import type { RequestTrace, RequestAttempt, RequestTraceListParams, RequestTraceAuditBucket } from '@/api/endpoints/traces';

export const PAGE_SIZE = 25;
export const TRACE_EXPORT_VERSION = 1;
export const MAX_COMPARE_TRACES = 4;

export type Translator = ReturnType<typeof useTranslations>;

export function optionalBoolean(value: string): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

export function nonAll(value: string) {
    return value && value !== 'all' ? value : undefined;
}

export function hasNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function formatCount(value: number | null | undefined) {
    return (value ?? 0).toLocaleString();
}

export function formatDuration(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(2)}s`;
}

export function formatCost(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    return value.toFixed(6);
}

export function formatTime(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '-';
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toLocaleString();
}

export function formatTokens(trace: RequestTrace) {
    const input = trace.input_tokens ?? 0;
    const output = trace.output_tokens ?? 0;
    const cache = trace.cache_tokens ?? 0;
    return `${input.toLocaleString()} / ${output.toLocaleString()} / ${cache.toLocaleString()}`;
}

export function totalTokens(trace: RequestTrace) {
    return (trace.input_tokens ?? 0) + (trace.output_tokens ?? 0) + (trace.cache_tokens ?? 0);
}

export function traceCost(trace: RequestTrace) {
    return trace.total_attempt_cost || trace.estimated_cost || 0;
}

export function formatAttemptTokens(attempt: RequestAttempt) {
    const parts = [
        `in ${attempt.input_tokens ?? 0}`,
        `out ${attempt.output_tokens ?? 0}`,
        `cache ${attempt.cache_tokens ?? 0}`,
    ];
    return parts.join(' / ');
}

export function statusClass(status: string | undefined) {
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

export function sourceLabel(source: string | undefined, t?: Translator) {
    const trimmed = (source ?? '').trim();
    if (t) {
        const key = `source.${trimmed}`;
        if (typeof t.has === 'function' && t.has(key)) {
            return t(key);
        }
    }
    switch (trimmed) {
        case 'relay':
            return 'Relay';
        case 'model_test':
            return 'Model Test';
        case 'images':
            return 'Images';
        case 'probe':
            return 'Probe';
        default:
            return trimmed || '-';
    }
}

export function protocolPath(attempt: RequestAttempt) {
    const parts = [attempt.request_protocol, attempt.upstream_protocol, attempt.response_protocol]
        .map((item) => item?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' -> ') : '-';
}

export function hasQueueMetadata(attempt: RequestAttempt) {
    return Boolean(
        attempt.channel_concurrency_mode
        || attempt.channel_concurrency_limit
        || attempt.channel_concurrency_wait_ms
        || attempt.channel_concurrency_acquired
        || attempt.channel_concurrency_timed_out,
    );
}

export function hasCapacityMetadata(attempt: RequestAttempt) {
    return Boolean(
        attempt.quota_status
        || attempt.quota_reason
        || attempt.capacity_status
        || attempt.capacity_reason
        || attempt.capacity_scope
        || attempt.capacity_source
        || attempt.last_observed_at
        || attempt.expires_at,
    );
}

export function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

export function sanitizeTraceForExport(trace: RequestTrace) {
    return compactObject({
        id: trace.id,
        trace_id: trace.trace_id,
        relay_log_id: trace.relay_log_id,
        thread_id: trace.thread_id,
        client_api_key_id: trace.client_api_key_id,
        group_id: trace.group_id,
        client_model: trace.client_model,
        request_source: trace.request_source,
        request_stream: trace.request_stream,
        final_status: trace.final_status,
        final_channel_id: trace.final_channel_id,
        final_site_id: trace.final_site_id,
        final_upstream_model: trace.final_upstream_model,
        attempts_count: trace.attempts_count,
        total_latency_ms: trace.total_latency_ms,
        input_tokens: trace.input_tokens,
        output_tokens: trace.output_tokens,
        cache_tokens: trace.cache_tokens,
        estimated_cost: trace.estimated_cost,
        final_success_cost: trace.final_success_cost,
        total_attempt_cost: trace.total_attempt_cost,
        failed_attempt_estimated_cost: trace.failed_attempt_estimated_cost,
        service_tier: trace.service_tier,
        used_ws: trace.used_ws,
        ws_mode: trace.ws_mode,
        ws_recovery: trace.ws_recovery,
        created_at: trace.created_at,
    });
}

export function sanitizeAttemptForExport(attempt: RequestAttempt) {
    return compactObject({
        id: attempt.id,
        trace_id: attempt.trace_id,
        relay_log_id: attempt.relay_log_id,
        attempt_index: attempt.attempt_index,
        attempt_num: attempt.attempt_num,
        channel_id: attempt.channel_id,
        channel_key_id: attempt.channel_key_id,
        key_id: attempt.key_id,
        channel_name: attempt.channel_name,
        site_id: attempt.site_id,
        site_account_id: attempt.site_account_id,
        account_id: attempt.account_id,
        base_url: attempt.base_url,
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
        channel_concurrency_mode: attempt.channel_concurrency_mode,
        channel_concurrency_limit: attempt.channel_concurrency_limit,
        channel_concurrency_wait_ms: attempt.channel_concurrency_wait_ms,
        channel_concurrency_acquired: attempt.channel_concurrency_acquired,
        channel_concurrency_timed_out: attempt.channel_concurrency_timed_out,
        duration_ms: attempt.duration_ms,
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
        error_summary: attempt.error_summary,
        sticky: attempt.sticky,
        created_at: attempt.created_at,
    });
}

export function sanitizeTraceParamsForExport(params: RequestTraceListParams) {
    return compactObject({
        time_range: params.time_range,
        start_time: params.start_time,
        end_time: params.end_time,
        model: params.model,
        trace_id: params.trace_id,
        api_key_id: params.api_key_id,
        channel_ids: params.channel_ids,
        status: params.status,
        http_status: params.http_status,
        failure_reason: params.failure_reason,
        protocol: params.protocol,
        source: params.source,
        stream: params.stream,
        failover: params.failover,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
    });
}

export function downloadJson(filename: string, payload: unknown) {
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

export function safeFilenamePart(value: string | undefined): string {
    const normalized = (value || 'trace').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
    return normalized.slice(0, 80) || 'trace';
}

export function exportFilenameTimestamp(): string {
    return exportTimestamp().replace(/[:.]/g, '-');
}

export function exportTimestamp(): string {
    return new Date().toISOString();
}

export type AuditBucket = {
    key: string;
    label: string;
    count: number;
    cost: number;
    tokens: number;
};

export function buildAuditBuckets(
    traces: RequestTrace[],
    keyForTrace: (trace: RequestTrace) => string | undefined,
    labelForTrace: (trace: RequestTrace, key: string) => string,
    limit = 5,
): AuditBucket[] {
    const buckets = new Map<string, AuditBucket>();
    for (const trace of traces) {
        const key = (keyForTrace(trace) || 'unknown').trim() || 'unknown';
        const existing = buckets.get(key);
        if (existing) {
            existing.count += 1;
            existing.cost += traceCost(trace);
            existing.tokens += totalTokens(trace);
            continue;
        }
        buckets.set(key, {
            key,
            label: labelForTrace(trace, key),
            count: 1,
            cost: traceCost(trace),
            tokens: totalTokens(trace),
        });
    }
    return [...buckets.values()]
        .sort((left, right) => right.count - left.count || right.cost - left.cost || left.label.localeCompare(right.label))
        .slice(0, limit);
}

export function mapAuditBuckets(
    buckets: RequestTraceAuditBucket[] | undefined,
    labelForKey: (key: string) => string,
) {
    return (buckets ?? []).map((bucket) => ({
        key: bucket.key || 'unknown',
        label: labelForKey(bucket.key || 'unknown'),
        count: bucket.count || 0,
        cost: bucket.cost || 0,
        tokens: bucket.total_tokens || 0,
    }));
}
