'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    ArrowLeft,
    ArrowRight,
    Database,
    Download,
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
    type RequestTraceAuditBucket,
    type RequestTraceAuditSummary,
    type RequestTrace,
    type RequestTraceListParams,
    useRequestTraceAudit,
    useRequestTraceDetail,
    useRequestTraces,
} from '@/api/endpoints/traces';
import { useNavStore } from '@/components/modules/navbar';
import { toast } from '@/components/common/Toast';
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
const TRACE_EXPORT_VERSION = 1;
const MAX_COMPARE_TRACES = 4;

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

function totalTokens(trace: RequestTrace) {
    return (trace.input_tokens ?? 0) + (trace.output_tokens ?? 0) + (trace.cache_tokens ?? 0);
}

function traceCost(trace: RequestTrace) {
    return trace.total_attempt_cost || trace.estimated_cost || 0;
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

function hasQueueMetadata(attempt: RequestAttempt) {
    return Boolean(
        attempt.channel_concurrency_mode
        || attempt.channel_concurrency_limit
        || attempt.channel_concurrency_wait_ms
        || attempt.channel_concurrency_acquired
        || attempt.channel_concurrency_timed_out,
    );
}

function hasCapacityMetadata(attempt: RequestAttempt) {
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

function queueModeLabel(mode: string | undefined, t: ReturnType<typeof useTranslations<'traces.detail'>>) {
    switch ((mode ?? '').trim()) {
        case 'database':
            return t('queueModeDatabase');
        case 'local':
            return t('queueModeLocal');
        default:
            return '-';
    }
}

function queueOutcomeLabel(attempt: RequestAttempt, t: ReturnType<typeof useTranslations<'traces.detail'>>) {
    if (attempt.channel_concurrency_timed_out) return t('queueTimedOut');
    if (attempt.channel_concurrency_acquired) return t('queueAcquired');
    if (hasQueueMetadata(attempt)) return t('no');
    return '-';
}

function quotaStatusLabel(status: string | undefined, t: ReturnType<typeof useTranslations<'traces.detail'>>) {
    switch ((status ?? '').trim()) {
        case 'available':
            return t('quotaStatusAvailable');
        case 'zero_balance':
            return t('quotaStatusZeroBalance');
        case 'account_disabled':
            return t('quotaStatusAccountDisabled');
        case 'quota_error':
            return t('quotaStatusQuotaError');
        case 'auth_error':
            return t('quotaStatusAuthError');
        case 'rate_limited':
            return t('quotaStatusRateLimited');
        case 'no_key':
            return t('quotaStatusNoKey');
        case 'site_disabled':
            return t('quotaStatusSiteDisabled');
        case 'account_missing':
            return t('quotaStatusAccountMissing');
        case 'model_disabled':
            return t('quotaStatusModelDisabled');
        case 'unknown':
            return t('quotaStatusUnknown');
        default:
            return status?.trim() || '-';
    }
}

function capacityStatusLabel(status: string | undefined, t: ReturnType<typeof useTranslations<'traces.detail'>>) {
    switch ((status ?? '').trim()) {
        case 'available':
            return t('capacityStatusAvailable');
        case 'blocked':
            return t('capacityStatusBlocked');
        case 'unknown':
            return t('capacityStatusUnknown');
        default:
            return status?.trim() || '-';
    }
}

function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

function sanitizeTraceForExport(trace: RequestTrace) {
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

function sanitizeAttemptForExport(attempt: RequestAttempt) {
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

function sanitizeTraceParamsForExport(params: RequestTraceListParams) {
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

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
}

function safeFilenamePart(value: string | undefined) {
    const normalized = (value || 'trace').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
    return normalized.slice(0, 80) || 'trace';
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

type AuditBucket = {
    key: string;
    label: string;
    count: number;
    cost: number;
    tokens: number;
};

function buildAuditBuckets(
    traces: RequestTrace[],
    keyForTrace: (trace: RequestTrace) => string | undefined,
    labelForTrace: (trace: RequestTrace, key: string) => string,
    limit = 5,
) {
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

function mapAuditBuckets(
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

function AuditList({
    title,
    items,
    total,
}: {
    title: string;
    items: AuditBucket[];
    total: number;
}) {
    return (
        <div className="min-w-0">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
            <div className="space-y-2">
                {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground">-</div>
                ) : items.map((item) => {
                    const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
                    return (
                        <div key={item.key} className="space-y-1">
                            <div className="flex min-w-0 items-center gap-2 text-xs">
                                <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
                                <span className="font-mono tabular-nums text-muted-foreground">{item.count} / {percent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, percent)}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TraceAuditPanel({
    traces,
    total,
    audit,
    isLoading,
    isError,
}: {
    traces: RequestTrace[];
    total: number;
    audit?: RequestTraceAuditSummary;
    isLoading: boolean;
    isError: boolean;
}) {
    const t = useTranslations('traces.audit');

    if (traces.length === 0 && !audit?.total) return null;

    const hasAudit = !!audit && audit.total > 0;
    const pageFailed = traces.filter((trace) => (trace.final_status || '').toLowerCase() === 'failed').length;
    const pageFailover = traces.filter((trace) => (trace.attempts_count || 0) > 1).length;
    const pageStream = traces.filter((trace) => trace.request_stream).length;
    const pageCost = traces.reduce((sum, trace) => sum + traceCost(trace), 0);
    const pageTokens = traces.reduce((sum, trace) => sum + totalTokens(trace), 0);
    const pageAvgAttempts = traces.length > 0
        ? traces.reduce((sum, trace) => sum + (trace.attempts_count || 0), 0) / traces.length
        : 0;
    const pageAvgLatency = traces.length > 0
        ? Math.round(traces.reduce((sum, trace) => sum + (trace.total_latency_ms || 0), 0) / traces.length)
        : 0;
    const scopeTotal = hasAudit ? audit.total : traces.length;
    const failed = hasAudit ? audit.failed : pageFailed;
    const failover = hasAudit ? audit.failover : pageFailover;
    const stream = hasAudit ? audit.stream : pageStream;
    const totalCost = hasAudit ? audit.cost : pageCost;
    const tokens = hasAudit ? audit.total_tokens : pageTokens;
    const avgAttempts = hasAudit ? audit.avg_attempts : pageAvgAttempts;
    const avgLatency = hasAudit ? Math.round(audit.avg_latency_ms) : pageAvgLatency;
    const statusBuckets = hasAudit
        ? mapAuditBuckets(audit.status_buckets, (key) => key === 'unknown' ? t('unknown') : key)
        : buildAuditBuckets(
            traces,
            (trace) => trace.final_status,
            (_trace, key) => key === 'unknown' ? t('unknown') : key,
        );
    const sourceBuckets = hasAudit
        ? mapAuditBuckets(audit.source_buckets, (key) => key === 'unknown' ? t('unknown') : sourceLabel(key))
        : buildAuditBuckets(
            traces,
            (trace) => trace.request_source,
            (trace, key) => key === 'unknown' ? t('unknown') : sourceLabel(trace.request_source || key),
        );
    const modelBuckets = hasAudit
        ? mapAuditBuckets(audit.model_buckets, (key) => key === 'unknown' ? t('unknown') : key)
        : buildAuditBuckets(
            traces,
            (trace) => trace.client_model || trace.final_upstream_model,
            (_trace, key) => key === 'unknown' ? t('unknown') : key,
        );
    const serviceTierBuckets = hasAudit
        ? mapAuditBuckets(audit.service_tier_buckets, (key) => key === 'unknown' ? t('unknown') : key)
        : buildAuditBuckets(
            traces,
            (trace) => trace.service_tier,
            (_trace, key) => key === 'unknown' ? t('unknown') : key,
        );

    return (
        <div className="rounded-lg border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-md px-2">
                    {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
                    {t('title')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                    {t('scope', { page: traces.length, matched: scopeTotal, total })}
                </span>
                {isError ? (
                    <Badge variant="outline" className="h-7 border-amber-500/30 px-2 text-amber-700 dark:text-amber-300">
                        {t('aggregateUnavailable')}
                    </Badge>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b pb-3 text-xs md:grid-cols-3 xl:grid-cols-6">
                <div>
                    <div className="text-muted-foreground">{t('failed')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{failed} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-muted-foreground">{t('failover')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{failover} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-muted-foreground">{t('stream')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{stream} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-muted-foreground">{t('avgAttempts')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{avgAttempts.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-muted-foreground">{t('avgLatency')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{formatDuration(avgLatency)}</div>
                </div>
                <div>
                    <div className="text-muted-foreground">{t('costTokens')}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">{formatCost(totalCost)} / {tokens.toLocaleString()}</div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AuditList title={t('statusBreakdown')} items={statusBuckets} total={scopeTotal} />
                <AuditList title={t('sourceBreakdown')} items={sourceBuckets} total={scopeTotal} />
                <AuditList title={t('modelBreakdown')} items={modelBuckets} total={scopeTotal} />
                <AuditList title={t('serviceTierBreakdown')} items={serviceTierBuckets} total={scopeTotal} />
            </div>
        </div>
    );
}

function TraceComparisonPanel({
    traces,
    onClear,
    onRemove,
    onFocus,
}: {
    traces: RequestTrace[];
    onClear: () => void;
    onRemove: (traceId: string) => void;
    onFocus: (traceId: string) => void;
}) {
    const t = useTranslations('traces.compare');

    if (traces.length === 0) return null;

    const fastest = traces.reduce<RequestTrace | null>((current, trace) => {
        if (!current) return trace;
        return (trace.total_latency_ms || Number.MAX_SAFE_INTEGER) < (current.total_latency_ms || Number.MAX_SAFE_INTEGER)
            ? trace
            : current;
    }, null);
    const slowest = traces.reduce<RequestTrace | null>((current, trace) => {
        if (!current) return trace;
        return (trace.total_latency_ms || 0) > (current.total_latency_ms || 0) ? trace : current;
    }, null);
    const failoverCount = traces.filter((trace) => (trace.attempts_count || 0) > 1).length;
    const costTotal = traces.reduce((sum, trace) => sum + traceCost(trace), 0);
    const tokenTotal = traces.reduce((sum, trace) => sum + totalTokens(trace), 0);

    return (
        <div className="rounded-lg border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-md px-2">
                    <GitBranch className="size-3.5" />
                    {t('title', { count: traces.length })}
                </Badge>
                <span className="text-xs text-muted-foreground">{t('hint', { count: MAX_COMPARE_TRACES })}</span>
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 rounded-md px-2 text-xs" onClick={onClear}>
                    <X className="size-3.5" />
                    {t('clear')}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('fastest')}</div>
                    <div className="mt-1 truncate font-mono tabular-nums" title={fastest?.trace_id}>
                        {fastest ? `${formatDuration(fastest.total_latency_ms)} / ${fastest.trace_id}` : '-'}
                    </div>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('slowest')}</div>
                    <div className="mt-1 truncate font-mono tabular-nums" title={slowest?.trace_id}>
                        {slowest ? `${formatDuration(slowest.total_latency_ms)} / ${slowest.trace_id}` : '-'}
                    </div>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('failover')}</div>
                    <div className="mt-1 font-mono tabular-nums">{failoverCount} / {traces.length}</div>
                </div>
                <div className="rounded-md border bg-background/40 p-2">
                    <div className="text-muted-foreground">{t('costTokens')}</div>
                    <div className="mt-1 font-mono tabular-nums">{formatCost(costTotal)} / {tokenTotal.toLocaleString()}</div>
                </div>
            </div>

            <div className="mt-3 overflow-auto rounded-md border">
                <table className="w-full min-w-[920px] text-left text-xs">
                    <thead className="bg-muted/70 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">{t('table.trace')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.status')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.route')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.attempts')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.latency')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.tokens')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.cost')}</th>
                            <th className="px-3 py-2 font-medium">{t('table.action')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {traces.map((trace) => (
                            <tr key={trace.trace_id || trace.id} className="border-t">
                                <td className="max-w-[220px] px-3 py-2">
                                    <div className="truncate font-medium" title={trace.client_model}>{trace.client_model || '-'}</div>
                                    <div className="truncate font-mono text-[11px] text-muted-foreground" title={trace.trace_id}>{trace.trace_id}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <Badge variant="outline" className={cn('h-5 rounded-md px-1.5 text-[10px]', statusClass(trace.final_status))}>
                                        {trace.final_status || '-'}
                                    </Badge>
                                </td>
                                <td className="max-w-[220px] px-3 py-2">
                                    <div className="truncate" title={trace.final_upstream_model || undefined}>{trace.final_upstream_model || '-'}</div>
                                    <div className="text-muted-foreground">{t('routeIds', { channel: trace.final_channel_id || 0, site: trace.final_site_id || 0 })}</div>
                                </td>
                                <td className="px-3 py-2 font-mono tabular-nums">{trace.attempts_count || 0}</td>
                                <td className="px-3 py-2 font-mono tabular-nums">{formatDuration(trace.total_latency_ms)}</td>
                                <td className="px-3 py-2 font-mono tabular-nums">{totalTokens(trace).toLocaleString()}</td>
                                <td className="px-3 py-2 font-mono tabular-nums">{formatCost(traceCost(trace))}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                        <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => onFocus(trace.trace_id)}>
                                            {t('focus')}
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => onRemove(trace.trace_id)}>
                                            {t('remove')}
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
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
    compareTraceIds,
    onSelect,
    onToggleCompare,
}: {
    items: RequestTrace[];
    selectedTraceId: string | null;
    compareTraceIds: string[];
    onSelect: (traceId: string) => void;
    onToggleCompare: (traceId: string, checked: boolean) => void;
}) {
    const t = useTranslations('traces');

    return (
        <div className="min-h-[28rem] overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-muted/70 text-muted-foreground backdrop-blur">
                    <tr>
                        <th className="w-[52px] px-3 py-2 font-medium">{t('table.compare')}</th>
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
                        const compared = compareTraceIds.includes(trace.trace_id);
                        return (
                            <tr
                                key={trace.trace_id || trace.id}
                                className={cn(
                                    'cursor-pointer border-b last:border-0 hover:bg-primary/5',
                                    active && 'bg-primary/10',
                                )}
                                onClick={() => onSelect(trace.trace_id)}
                            >
                                <td className="px-3 py-3">
                                    <input
                                        type="checkbox"
                                        checked={compared}
                                        aria-label={t('compare.selectTrace')}
                                        className="size-4 rounded border-border accent-primary"
                                        onChange={(event) => onToggleCompare(trace.trace_id, event.target.checked)}
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                </td>
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
    const tExport = useTranslations('traces.export');
    const openLogTarget = useNavStore((state) => state.openLogTarget);
    const detailQuery = useRequestTraceDetail(traceId ?? undefined, !!traceId);
    const detail = detailQuery.data;

    const handleExportDetail = useCallback(() => {
        if (!detail) {
            toast.warning(tExport('empty'));
            return;
        }

        try {
            downloadJson(`octopus-trace-${safeFilenamePart(detail.trace.trace_id)}-${exportFilenameTimestamp()}.json`, {
                schema: 'octopus.request_traces.detail',
                version: TRACE_EXPORT_VERSION,
                exported_at: exportTimestamp(),
                scope: 'trace_detail',
                trace: sanitizeTraceForExport(detail.trace),
                attempts: detail.attempts.map(sanitizeAttemptForExport),
            });
            toast.success(tExport('success'), { description: tExport('safe') });
        } catch (error) {
            toast.error(tExport('failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    }, [detail, tExport]);

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
        <aside className="flex min-h-[28rem] min-w-0 self-start flex-col gap-3 rounded-lg border bg-card p-3 xl:sticky xl:top-3">
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
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md px-2 text-xs"
                    onClick={handleExportDetail}
                >
                    <Download className="size-3.5" />
                    {tExport('detail')}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs 2xl:grid-cols-4">
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

            <div>
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

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs xl:grid-cols-3 2xl:grid-cols-4">
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
                                {hasCapacityMetadata(attempt) ? (
                                    <>
                                        <div>
                                            <div className="text-muted-foreground">{t('quotaStatus')}</div>
                                            <div>{quotaStatusLabel(attempt.quota_status, t)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('quotaReason')}</div>
                                            <div className="truncate" title={attempt.quota_reason || undefined}>{attempt.quota_reason || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('capacityStatus')}</div>
                                            <div>{capacityStatusLabel(attempt.capacity_status, t)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('capacityReason')}</div>
                                            <div className="truncate" title={attempt.capacity_reason || undefined}>{attempt.capacity_reason || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('capacityScope')}</div>
                                            <div className="truncate" title={attempt.capacity_scope || undefined}>{attempt.capacity_scope || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('capacitySource')}</div>
                                            <div className="truncate" title={attempt.capacity_source || undefined}>{attempt.capacity_source || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('lastObservedAt')}</div>
                                            <div className="font-mono">{formatTime(attempt.last_observed_at)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('expiresAt')}</div>
                                            <div className="font-mono">{formatTime(attempt.expires_at)}</div>
                                        </div>
                                    </>
                                ) : null}
                                {hasQueueMetadata(attempt) ? (
                                    <>
                                        <div>
                                            <div className="text-muted-foreground">{t('queueMode')}</div>
                                            <div>{queueModeLabel(attempt.channel_concurrency_mode, t)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('queueLimit')}</div>
                                            <div className="font-mono">{attempt.channel_concurrency_limit || '-'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('queueWait')}</div>
                                            <div className="font-mono">{formatDuration(attempt.channel_concurrency_wait_ms)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">{t('queueOutcome')}</div>
                                            <div>{queueOutcomeLabel(attempt, t)}</div>
                                        </div>
                                    </>
                                ) : null}
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
    const refetchTraces = tracesQuery.refetch;
    const refetchAudit = auditQuery.refetch;

    const resetTraceListPosition = useCallback(() => {
        setPage(1);
        setSelectedTraceId(null);
        setCompareTraceIds([]);
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        void refetchTraces();
        void refetchAudit();
    }, [autoRefresh, refreshInterval, refetchAudit, refetchTraces]);

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

    return (
        <div className="space-y-3 pb-24 pr-1 md:pb-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
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
                <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="outline" className="h-8 rounded-md px-2">
                            {t('title')}
                        </Badge>
                        {tracesQuery.error ? (
                            <Badge variant="outline" className="h-8 border-destructive/30 px-2 text-destructive">
                                {t('loadFailed')}
                            </Badge>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void tracesQuery.refetch();
                                void auditQuery.refetch();
                            }}
                            disabled={tracesQuery.isFetching || auditQuery.isFetching}
                        >
                            {tracesQuery.isFetching || auditQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            {t('refresh')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleExportPage}
                            disabled={traces.length === 0}
                        >
                            <Download className="size-4" />
                            {t('export.page')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={modelFilter} onChange={(event) => {
                            resetTraceListPosition();
                            setModelFilter(event.target.value);
                        }} placeholder={t('filters.model')} className="pl-8" />
                    </div>
                    <Input value={traceFilter} onChange={(event) => {
                        resetTraceListPosition();
                        setTraceFilter(event.target.value);
                    }} placeholder={t('filters.trace')} />
                    <Input value={httpStatusFilter} onChange={(event) => {
                        resetTraceListPosition();
                        setHTTPStatusFilter(event.target.value);
                    }} placeholder={t('filters.http')} />
                    <Input value={failureFilter} onChange={(event) => {
                        resetTraceListPosition();
                        setFailureFilter(event.target.value);
                    }} placeholder={t('filters.failure')} />
                    <Select value={timeRange} onValueChange={(value) => {
                        resetTraceListPosition();
                        setTimeRange(value);
                    }}>
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
                    <Select value={statusFilter} onValueChange={(value) => {
                        resetTraceListPosition();
                        setStatusFilter(value);
                    }}>
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
                    <Select value={sourceFilter} onValueChange={(value) => {
                        resetTraceListPosition();
                        setSourceFilter(value);
                    }}>
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
                    <Select value={streamFilter} onValueChange={(value) => {
                        resetTraceListPosition();
                        setStreamFilter(value);
                    }}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('stream.all')}</SelectItem>
                            <SelectItem value="true">{t('stream.stream')}</SelectItem>
                            <SelectItem value="false">{t('stream.nonStream')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={failoverFilter} onValueChange={(value) => {
                        resetTraceListPosition();
                        setFailoverFilter(value);
                    }}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('failover.all')}</SelectItem>
                            <SelectItem value="true">{t('failover.yes')}</SelectItem>
                            <SelectItem value="false">{t('failover.no')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={protocolFilter} onValueChange={(value) => {
                        resetTraceListPosition();
                        setProtocolFilter(value);
                    }}>
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
                            onClick={() => {
                                setSelectedTraceId(null);
                                setCompareTraceIds([]);
                                setPage((current) => Math.max(1, current - 1));
                            }}
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
                            disabled={!hasMore || tracesQuery.isFetching}
                            onClick={() => {
                                setSelectedTraceId(null);
                                setCompareTraceIds([]);
                                setPage((current) => current + 1);
                            }}
                        >
                            {t('pager.next')}
                            <ArrowRight className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <TraceAuditPanel
                traces={traces}
                total={total}
                audit={auditQuery.data}
                isLoading={auditQuery.isFetching}
                isError={!!auditQuery.error}
            />

            <TraceComparisonPanel
                traces={compareTraces}
                onClear={handleClearCompare}
                onRemove={handleRemoveCompare}
                onFocus={handleFocusTrace}
            />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] 2xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
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
                            selectedTraceId={effectiveSelectedTraceId}
                            compareTraceIds={visibleCompareTraceIds}
                            onSelect={setSelectedTraceId}
                            onToggleCompare={handleToggleCompare}
                        />
                    )}
                </div>
                <div className="min-h-0">
                    <TraceDetailPanel traceId={effectiveSelectedTraceId} />
                </div>
            </div>
        </div>
    );
}
