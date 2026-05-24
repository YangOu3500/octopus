'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Cpu, Zap, AlertCircle, ArrowDownToLine, ArrowUpFromLine, DollarSign, ArrowRight, ArrowDown, Send, MessageSquare, Loader2, RotateCw, ChevronDown, ChevronUp, Pin, KeyRound, CircleOff, Info, Link } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'motion/react';
import JsonView from '@uiw/react-json-view';
import { githubDarkTheme } from '@uiw/react-json-view/githubDark';
import { githubLightTheme } from '@uiw/react-json-view/githubLight';
import { useTheme } from 'next-themes';
import { type RelayLog, type RelayLogWSMode, type RelayLogWSRecovery, type ChannelAttempt, type AttemptStatus, useLogDetail } from '@/api/endpoints/log';
import { getModelIcon } from '@/lib/model-icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CopyIconButton } from '@/components/common/CopyButton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    MorphingDialog,
    MorphingDialogTrigger,
    MorphingDialogContainer,
    MorphingDialogContent,
    MorphingDialogClose,
    MorphingDialogTitle,
    MorphingDialogDescription,
    useMorphingDialog,
} from '@/components/ui/morphing-dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/animate-ui/components/animate/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/common/Toast';
import { useUpdateSiteChannelModelDisabled } from '@/api/endpoints/site-channel';

export type LogSiteActionTarget = {
    siteId: number;
    siteName: string;
    accountId: number;
    accountName: string;
    groupKey: string;
    groupName: string;
    modelName: string;
    modelDisabled: boolean;
    canDisableModel: boolean;
    channelId: number;
    channelName: string;
};

export type LogSiteActionTargets = {
    attemptTargets: Array<LogSiteActionTarget | null>;
    legacyErrorTarget: LogSiteActionTarget | null;
};

type LogCardTranslations = ReturnType<typeof useTranslations<'log.card'>>;

function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function sanitizeErrorMessage(raw: string | undefined | null): string {
    if (!raw) return '';
    let text = raw.replace(/^upstream error:\s*(\d+):\s*/i, (_m, code) => `[HTTP ${code}] `);
    if (/<\/?(html|body|head|title|div|p|h[1-6]|br|script|style)[\s>]/i.test(text)) {
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const summarySource = titleMatch?.[1] || h1Match?.[1] || '';
        const summary = summarySource
            ? summarySource.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '(HTML response)';
        const stripped = text
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ')
            .trim();
        const detail = stripped.length > 500 ? `${stripped.slice(0, 500)}…` : stripped;
        text = summary && detail && detail !== summary ? `${summary} — ${detail}` : (summary || detail || '(HTML response)');
    }
    return text;
}

interface MergedAttempt extends ChannelAttempt {
    repeat: number;
    lastAttemptNum: number;
    lastAttemptIndex: number;
    totalDuration: number;
    originalIndex: number;
}

function sameAttemptGroup(left: ChannelAttempt, right: ChannelAttempt) {
    return (
        left.channel_id === right.channel_id
        && (left.key_id || left.channel_key_id || 0) === (right.key_id || right.channel_key_id || 0)
        && left.model_name === right.model_name
        && (left.upstream_model ?? '') === (right.upstream_model ?? '')
        && left.status === right.status
        && (left.http_status ?? 0) === (right.http_status ?? 0)
        && (left.failure_reason ?? '') === (right.failure_reason ?? '')
        && (left.retryable ?? false) === (right.retryable ?? false)
        && (left.quota_status ?? '') === (right.quota_status ?? '')
        && (left.quota_reason ?? '') === (right.quota_reason ?? '')
        && (left.capacity_status ?? '') === (right.capacity_status ?? '')
        && (left.capacity_reason ?? '') === (right.capacity_reason ?? '')
        && (left.capacity_scope ?? '') === (right.capacity_scope ?? '')
        && (left.capacity_source ?? '') === (right.capacity_source ?? '')
        && (left.last_observed_at ?? 0) === (right.last_observed_at ?? 0)
        && (left.expires_at ?? 0) === (right.expires_at ?? 0)
        && (left.channel_concurrency_mode ?? '') === (right.channel_concurrency_mode ?? '')
        && (left.channel_concurrency_limit ?? 0) === (right.channel_concurrency_limit ?? 0)
        && (left.channel_concurrency_wait_ms ?? 0) === (right.channel_concurrency_wait_ms ?? 0)
        && (left.channel_concurrency_acquired ?? false) === (right.channel_concurrency_acquired ?? false)
        && (left.channel_concurrency_timed_out ?? false) === (right.channel_concurrency_timed_out ?? false)
        && (left.msg ?? '') === (right.msg ?? '')
    );
}

function mergeAdjacentAttempts(attempts: ChannelAttempt[]): MergedAttempt[] {
    const out: MergedAttempt[] = [];
    for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        const last = out[out.length - 1];
        if (last && sameAttemptGroup(last, a)) {
            last.repeat += 1;
            last.lastAttemptNum = a.attempt_num;
            last.lastAttemptIndex = a.attempt_index || a.attempt_num;
            last.totalDuration += a.total_ms || a.duration_ms || a.duration;
            continue;
        }
        out.push({
            ...a,
            repeat: 1,
            lastAttemptNum: a.attempt_num,
            lastAttemptIndex: a.attempt_index || a.attempt_num,
            totalDuration: a.total_ms || a.duration_ms || a.duration,
            originalIndex: i,
        });
    }
    return out;
}

function makeDisableTargetKey(target: LogSiteActionTarget | null | undefined) {
    if (!target) return '';
    return `${target.siteId}\u0000${target.accountId}\u0000${target.groupKey}\u0000${target.modelName}`;
}

function formatOptionalTokenCount(value: number | null | undefined) {
    if (typeof value !== 'number') return '—';
    return value.toLocaleString();
}

function hasNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function formatOptionalDuration(value: number | null | undefined) {
    if (!hasNumber(value)) return '—';
    return formatDuration(value);
}

function formatOptionalCost(value: number | null | undefined) {
    if (!hasNumber(value)) return '—';
    return Number(value).toFixed(6);
}

function formatOptionalDateTime(value: number | null | undefined) {
    if (!hasNumber(value) || value <= 0) return '—';
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatEntity(label: string, id: number | null | undefined, name?: string | null) {
    const trimmed = name?.trim();
    if (trimmed) return id ? `${trimmed} (#${id})` : trimmed;
    return id ? `${label} #${id}` : '—';
}

function formatAttemptIndex(attempt: MergedAttempt) {
    const first = attempt.attempt_index || attempt.attempt_num || 0;
    const last = attempt.lastAttemptIndex || attempt.lastAttemptNum || first;
    if (!first) return '—';
    return attempt.repeat > 1 && last !== first ? `${first}-${last}` : String(first);
}

function formatAttemptKey(attempt: ChannelAttempt, t: LogCardTranslations) {
    const keyID = attempt.key_id || attempt.channel_key_id || 0;
    return keyID ? `${t('key')} #${keyID}` : '—';
}

function formatAttemptSite(attempt: ChannelAttempt, target: LogSiteActionTarget | null, t: LogCardTranslations) {
    return formatEntity(t('site'), attempt.site_id, target?.siteName);
}

function formatAttemptAccount(attempt: ChannelAttempt, target: LogSiteActionTarget | null, t: LogCardTranslations) {
    return formatEntity(t('account'), attempt.account_id || attempt.site_account_id, target?.accountName);
}

function formatAttemptRetryable(attempt: ChannelAttempt, t: LogCardTranslations) {
    if (attempt.retryable === true) return t('yes');
    if (attempt.status === 'failed') return t('no');
    return '—';
}

function hasQueueMetadata(attempt: ChannelAttempt) {
    return Boolean(
        attempt.channel_concurrency_mode
        || attempt.channel_concurrency_limit
        || attempt.channel_concurrency_wait_ms
        || attempt.channel_concurrency_acquired
        || attempt.channel_concurrency_timed_out,
    );
}

function hasCapacityMetadata(attempt: ChannelAttempt) {
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

function formatQueueMode(mode: string | undefined, t: LogCardTranslations) {
    switch ((mode ?? '').trim()) {
        case 'database':
            return t('queueModeDatabase');
        case 'local':
            return t('queueModeLocal');
        default:
            return '鈥?';
    }
}

function formatQueueOutcome(attempt: ChannelAttempt, t: LogCardTranslations) {
    if (attempt.channel_concurrency_timed_out) return t('queueOutcomeTimedOut');
    if (attempt.channel_concurrency_acquired) return t('queueOutcomeAcquired');
    if (hasQueueMetadata(attempt)) return t('unknown');
    return '鈥?';
}

function formatAttemptQuotaStatus(status: string | undefined, t: LogCardTranslations) {
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
            return formatOptionalText(status);
    }
}

function formatAttemptCapacityStatus(status: string | undefined, t: LogCardTranslations) {
    switch ((status ?? '').trim()) {
        case 'available':
            return t('capacityStatusAvailable');
        case 'blocked':
            return t('capacityStatusBlocked');
        case 'unknown':
            return t('capacityStatusUnknown');
        default:
            return formatOptionalText(status);
    }
}

function formatOptionalText(value: string | null | undefined) {
    return value?.trim() || '—';
}

function formatClientIP(value: string | null | undefined) {
    const ip = value?.trim();
    if (!ip) return '—';
    const ipv4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    if (ipv4) return `${ipv4[1]}.*`;
    if (ip.includes(':') && ip.length > 24) return `${ip.slice(0, 20)}…`;
    return ip;
}

const LOG_DETAIL_EXPORT_VERSION = 1;

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
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

function formatRequestSource(value: string | null | undefined) {
    const source = value?.trim();
    switch (source) {
        case 'relay':
            return 'Relay';
        case 'images':
            return 'Images';
        case 'probe':
            return 'Probe';
        default:
            return source || '—';
    }
}

function buildSafeLogDetailExport(log: RelayLog) {
    const exportedAt = exportTimestamp();

    return {
        export_version: LOG_DETAIL_EXPORT_VERSION,
        exported_at: exportedAt,
        safety: {
            content: 'server_redacted_request_response_detail',
            excludes: [
                'full api key',
                'cookie',
                'authorization',
                'set-cookie',
                'x-api-key',
                'bearer token',
                'session',
                'jwt',
            ],
        },
        log: {
            id: log.id,
            trace_id: log.trace_id,
            thread_id: log.thread_id,
            client_api_key_id: log.client_api_key_id,
            group_id: log.group_id,
            time: log.time,
            request_model_name: log.request_model_name,
            request_stream: log.request_stream,
            request_source: log.request_source,
            client_ip: formatClientIP(log.client_ip),
            channel_id: log.channel,
            channel_name: log.channel_name,
            actual_model_name: log.actual_model_name,
            final_status: log.final_status,
            final_channel_id: log.final_channel_id,
            final_site_id: log.final_site_id,
            final_upstream_model: log.final_upstream_model,
            attempts_count: log.attempts_count || log.total_attempts || log.attempts?.length || 0,
            total_latency_ms: log.total_latency_ms || log.use_time,
            first_token_ms: log.ftut,
            input_tokens: log.input_tokens,
            transport_input_tokens: log.transport_input_tokens,
            bill_input_tokens: log.bill_input_tokens,
            cache_read_tokens: log.cache_read_tokens,
            cache_write_tokens: log.cache_write_tokens,
            cache_tokens: log.cache_tokens,
            output_tokens: log.output_tokens,
            estimated_cost: log.estimated_cost,
            final_success_cost: log.final_success_cost,
            total_attempt_cost: log.total_attempt_cost,
            failed_attempt_estimated_cost: log.failed_attempt_estimated_cost,
            service_tier: log.service_tier,
            used_ws: log.used_ws,
            ws_mode: log.ws_mode,
            ws_recovery: log.ws_recovery,
            error: sanitizeErrorMessage(log.error),
            request_content: log.request_content || '',
            response_content: log.response_content || '',
            attempts: (log.attempts ?? []).map((attempt) => ({
                attempt_num: attempt.attempt_num,
                attempt_index: attempt.attempt_index,
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
                failure_reason: sanitizeErrorMessage(attempt.failure_reason),
                retryable: attempt.retryable,
                quota_status: attempt.quota_status,
                quota_reason: attempt.quota_reason,
                capacity_status: attempt.capacity_status,
                capacity_reason: attempt.capacity_reason,
                capacity_scope: attempt.capacity_scope,
                capacity_source: attempt.capacity_source,
                last_observed_at: attempt.last_observed_at,
                expires_at: attempt.expires_at,
                duration_ms: attempt.duration_ms || attempt.duration,
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
                error_summary: sanitizeErrorMessage(attempt.error_summary || attempt.msg),
                sticky: attempt.sticky,
                created_at: attempt.created_at,
                channel_concurrency_mode: attempt.channel_concurrency_mode,
                channel_concurrency_limit: attempt.channel_concurrency_limit,
                channel_concurrency_wait_ms: attempt.channel_concurrency_wait_ms,
                channel_concurrency_acquired: attempt.channel_concurrency_acquired,
                channel_concurrency_timed_out: attempt.channel_concurrency_timed_out,
            })),
        },
    };
}

function formatCostIncurred(value: string | null | undefined, t: LogCardTranslations) {
    switch (value?.trim().toLowerCase()) {
        case 'yes':
            return t('yes');
        case 'no':
            return t('no');
        case 'unknown':
            return t('unknown');
        default:
            return '—';
    }
}

function formatCostSource(value: string | null | undefined, t: LogCardTranslations) {
    switch (value?.trim().toLowerCase()) {
        case 'usage':
            return t('costSourceUsage');
        case 'estimated_input':
            return t('costSourceEstimatedInput');
        case 'estimated_tokens':
            return t('costSourceEstimatedTokens');
        case 'unknown':
            return t('unknown');
        default:
            return formatOptionalText(value);
    }
}

function formatProtocolPath(attempt: ChannelAttempt) {
    const parts = [attempt.request_protocol, attempt.upstream_protocol, attempt.response_protocol]
        .map((part) => part?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' -> ') : '—';
}

function formatAttemptTokens(attempt: ChannelAttempt, t: LogCardTranslations) {
    const parts: string[] = [];
    const inputTokens = attempt.input_tokens;
    const outputTokens = attempt.output_tokens;
    const cacheTokens = attempt.cache_tokens;
    if (hasNumber(inputTokens)) parts.push(`${t('inputShort')} ${inputTokens.toLocaleString()}`);
    if (hasNumber(outputTokens)) parts.push(`${t('outputShort')} ${outputTokens.toLocaleString()}`);
    if (hasNumber(cacheTokens)) parts.push(`${t('cacheShort')} ${cacheTokens.toLocaleString()}`);
    return parts.length > 0 ? parts.join(' / ') : '—';
}

function getAttemptFailureReason(attempt: ChannelAttempt) {
    return sanitizeErrorMessage(attempt.failure_reason);
}

function getAttemptErrorSummary(attempt: ChannelAttempt) {
    const summary = sanitizeErrorMessage(attempt.error_summary || attempt.msg);
    const reason = getAttemptFailureReason(attempt);
    return summary && summary !== reason ? summary : '';
}

function hasTraceSummary(log: RelayLog) {
    return Boolean(
        log.trace_id
        || log.thread_id
        || log.client_api_key_id
        || log.group_id
        || log.client_ip
        || log.request_source
        || log.final_status
        || log.final_channel_id
        || log.final_site_id
        || log.final_upstream_model
        || log.attempts_count
        || log.total_latency_ms
        || log.cache_tokens
        || log.estimated_cost
        || log.final_success_cost
        || log.total_attempt_cost
        || log.failed_attempt_estimated_cost
        || log.service_tier,
    );
}

function formatFinalStatus(status: string | undefined, t: LogCardTranslations) {
    switch (status) {
        case 'success':
            return t('success');
        case 'failed':
            return t('failed');
        case 'canceled':
            return t('canceled');
        default:
            return status?.trim() || '—';
    }
}

function hasInputTokenDetails(log: RelayLog) {
    return (
        log.transport_input_tokens != null ||
        log.bill_input_tokens != null ||
        log.cache_read_tokens != null ||
        log.cache_write_tokens != null
    );
}

function getHeadlineInputTokens(log: RelayLog) {
    const hasCache = log.cache_read_tokens != null || log.cache_write_tokens != null;
    if (!hasCache) return log.input_tokens;
    return log.input_tokens + (log.cache_write_tokens ?? 0);
}

function getWSBadgeMeta(mode: RelayLogWSMode | null | undefined, usedWS: boolean | undefined, t: ReturnType<typeof useTranslations<'log.card'>>) {
    if (!usedWS && !mode) return null;

    switch (mode) {
        case 'continuation':
            return {
                label: t('wsContinuation'),
                className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                description: t('wsContinuationHint'),
            };
        case 'replay':
            return {
                label: t('wsReplay'),
                className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                description: t('wsReplayHint'),
            };
        case 'fresh':
        default:
            return {
                label: t('ws'),
                className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
                description: t('wsFreshHint'),
            };
    }
}

function getWSRecoveryBadgeMeta(recovery: RelayLogWSRecovery | null | undefined, t: ReturnType<typeof useTranslations<'log.card'>>) {
    switch (recovery) {
        case 'reconnect':
            return {
                label: t('wsReconnect'),
                className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                description: t('wsReconnectHint'),
            };
        case 'replay':
            return {
                label: t('wsReplayRecovery'),
                className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                description: t('wsReplayRecoveryHint'),
            };
        case 'downgrade':
            return {
                label: t('wsDowngrade'),
                className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
                description: t('wsDowngradeHint'),
            };
        default:
            return null;
    }
}

function getAttemptStatusMeta(status: AttemptStatus, t: ReturnType<typeof useTranslations<'log.card'>>) {
    switch (status) {
        case 'success':
            return {
                label: t('success'),
                badgeClassName: 'bg-primary/15 text-primary',
                containerClassName: 'bg-primary/5 border-primary/20 hover:bg-primary/10',
                messageClassName: 'text-primary/90 border-primary/30',
            };
        case 'skipped':
            return {
                label: t('skipped'),
                badgeClassName: 'bg-muted text-muted-foreground',
                containerClassName: 'bg-muted/40 border-border/60 hover:bg-muted/60',
                messageClassName: 'text-muted-foreground border-border/50',
            };
        case 'circuit_break':
            return {
                label: t('circuitBreak'),
                badgeClassName: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                containerClassName: 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10',
                messageClassName: 'text-amber-700 dark:text-amber-300 border-amber-500/30',
            };
        case 'failed':
        default:
            return {
                label: t('failed'),
                badgeClassName: 'bg-destructive/15 text-destructive',
                containerClassName: 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10',
                messageClassName: 'text-destructive/90 border-destructive/30',
            };
    }
}

interface RetryBadgeWithTooltipProps {
    channelName: string;
    brandColor: string;
    attempts: ChannelAttempt[];
}

function RetryBadgeWithTooltip({ channelName, brandColor, attempts }: RetryBadgeWithTooltipProps) {
    const t = useTranslations('log.card');
    const merged = useMemo(() => mergeAdjacentAttempts(attempts), [attempts]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge
                    variant="secondary"
                    className="shrink-0 text-xs px-1.5 py-0 cursor-help"
                    style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                >
                    <RotateCw className="size-3 mr-1 opacity-80" />
                    {channelName}
                </Badge>
            </TooltipTrigger>
            <TooltipContent className="border bg-card p-2 min-w-[280px] shadow-sm rounded-2xl flex flex-col gap-1">
                {merged.map((attempt, idx) => {
                    const statusMeta = getAttemptStatusMeta(attempt.status, t);

                    return (
                        <div key={idx} className="flex flex-col w-full">
                            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                                <Badge
                                    className={cn(
                                        'h-5 shrink-0 px-1.5 text-[10px] font-bold uppercase shadow-none border-0',
                                        statusMeta.badgeClassName,
                                    )}
                                >
                                    {statusMeta.label}
                                </Badge>
                                <div className="flex min-w-0 flex-col flex-1">
                                    <span className="truncate text-xs font-semibold text-foreground">
                                        {attempt.channel_name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {attempt.model_name} • {formatDuration(attempt.totalDuration)}
                                    </span>
                                </div>
                                {attempt.repeat > 1 ? (
                                    <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[10px] font-semibold tabular-nums">
                                        ×{attempt.repeat}
                                    </Badge>
                                ) : null}
                            </div>
                            {idx < merged.length - 1 ? (
                                <div className="flex justify-center py-0.5">
                                    <ArrowDown className="size-3 text-muted-foreground/30" />
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </TooltipContent>
        </Tooltip>
    );
}

function WSModeBadge({ log }: { log: RelayLog }) {
    const t = useTranslations('log.card');
    const modeMeta = getWSBadgeMeta(log.ws_mode, log.used_ws, t);
    const recoveryMeta = getWSRecoveryBadgeMeta(log.ws_recovery, t);

    if (!modeMeta && !recoveryMeta) return null;

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            {modeMeta ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge
                            variant="secondary"
                            className={cn('shrink-0 gap-1 px-1.5 py-0 text-xs', modeMeta.className)}
                        >
                            <Link className="size-3.5 shrink-0" />
                            {modeMeta.label}
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{modeMeta.description}</TooltipContent>
                </Tooltip>
            ) : null}
            {recoveryMeta ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge
                            variant="secondary"
                            className={cn('shrink-0 gap-1 px-1.5 py-0 text-xs', recoveryMeta.className)}
                        >
                            <RotateCw className="size-3.5 shrink-0" />
                            {recoveryMeta.label}
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{recoveryMeta.description}</TooltipContent>
                </Tooltip>
            ) : null}
        </div>
    );
}

function InputTokenDetailsPopover({ log }: { log: RelayLog }) {
    const t = useTranslations('log.card');

    if (!hasInputTokenDetails(log)) return null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t('inputDetails')}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/80 transition hover:bg-muted/70 hover:text-foreground"
                >
                    <Info className="size-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="start"
                onOpenAutoFocus={(event) => event.preventDefault()}
                className="w-56 rounded-2xl border border-border/70 bg-card p-3 shadow-xl"
            >
                <div className="space-y-2">
                    <div className="text-xs font-semibold text-foreground">{t('inputDetails')}</div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <span className="text-muted-foreground">{t('transportInput')}</span>
                        <span className="text-right font-mono text-foreground">{formatOptionalTokenCount(log.transport_input_tokens)}</span>
                        <span className="text-muted-foreground">{t('billInput')}</span>
                        <span className="text-right font-mono text-foreground">{formatOptionalTokenCount(log.bill_input_tokens)}</span>
                        <span className="text-muted-foreground">{t('cacheRead')}</span>
                        <span className="text-right font-mono text-foreground">{formatOptionalTokenCount(log.cache_read_tokens)}</span>
                        <span className="text-muted-foreground">{t('cacheWrite')}</span>
                        <span className="text-right font-mono text-foreground">{formatOptionalTokenCount(log.cache_write_tokens)}</span>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function TraceFieldGrid({ rows }: { rows: Array<{ label: string; value: string; title?: string }> }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {rows.map((row) => (
                <div
                    key={row.label}
                    className="min-w-0 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 grid grid-cols-[auto_1fr] items-center gap-2"
                >
                    <span className="text-[10px] font-medium text-muted-foreground">{row.label}</span>
                    <span
                        className="min-w-0 truncate text-right font-mono text-[11px] text-foreground"
                        title={row.title ?? row.value}
                    >
                        {row.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

function TraceSummary({ log }: { log: RelayLog }) {
    const t = useTranslations('log.card');
    const finalUpstreamModel = log.final_upstream_model?.trim() || log.actual_model_name?.trim();
    const serviceTier = log.service_tier?.trim();

    const rows = [
        log.trace_id ? { label: t('traceId'), value: log.trace_id, title: log.trace_id } : null,
        log.thread_id ? { label: t('threadId'), value: log.thread_id, title: log.thread_id } : null,
        log.client_api_key_id ? { label: t('clientApiKeyId'), value: `${t('key')} #${log.client_api_key_id}` } : null,
        log.group_id ? { label: t('groupId'), value: `${t('group')} #${log.group_id}` } : null,
        log.client_ip ? { label: t('clientIP'), value: formatClientIP(log.client_ip), title: log.client_ip } : null,
        log.request_source ? { label: t('requestSource'), value: formatRequestSource(log.request_source), title: log.request_source } : null,
        log.request_model_name ? { label: t('clientRequestModel'), value: log.request_model_name, title: log.request_model_name } : null,
        log.final_status ? { label: t('finalStatus'), value: formatFinalStatus(log.final_status, t), title: log.final_status } : null,
        log.attempts_count ? { label: t('attemptCount'), value: log.attempts_count.toLocaleString() } : null,
        log.final_channel_id ? { label: t('finalChannel'), value: `${t('channel')} #${log.final_channel_id}` } : null,
        log.final_site_id ? { label: t('finalSite'), value: `${t('site')} #${log.final_site_id}` } : null,
        finalUpstreamModel ? { label: t('finalUpstreamModel'), value: finalUpstreamModel, title: finalUpstreamModel } : null,
        serviceTier ? { label: t('serviceTier'), value: serviceTier, title: serviceTier } : null,
        log.total_latency_ms ? { label: t('totalLatency'), value: formatOptionalDuration(log.total_latency_ms) } : null,
        log.cache_tokens ? { label: t('cacheTokens'), value: log.cache_tokens.toLocaleString() } : null,
        log.estimated_cost ? { label: t('estimatedCost'), value: formatOptionalCost(log.estimated_cost) } : null,
        hasNumber(log.final_success_cost) ? { label: t('finalSuccessCost'), value: formatOptionalCost(log.final_success_cost) } : null,
        hasNumber(log.total_attempt_cost) ? { label: t('totalAttemptCost'), value: formatOptionalCost(log.total_attempt_cost) } : null,
        hasNumber(log.failed_attempt_estimated_cost) ? { label: t('failedAttemptEstimatedCost'), value: formatOptionalCost(log.failed_attempt_estimated_cost) } : null,
    ].filter((row): row is { label: string; value: string; title?: string } => Boolean(row));

    if (rows.length === 0) return null;

    return (
        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Info className="size-3.5 text-muted-foreground" />
                <span>{t('trace')}</span>
            </div>
            <TraceFieldGrid rows={rows} />
        </div>
    );
}

function AttemptTraceDetails({ attempt, target }: { attempt: MergedAttempt; target: LogSiteActionTarget | null }) {
    const t = useTranslations('log.card');
    const failureReason = getAttemptFailureReason(attempt);
    const errorSummary = getAttemptErrorSummary(attempt);
    const totalMS = attempt.total_ms || attempt.duration_ms || attempt.totalDuration || attempt.duration;
    const capacityRows = hasCapacityMetadata(attempt)
        ? [
            { label: t('quotaStatus'), value: formatAttemptQuotaStatus(attempt.quota_status, t), title: formatAttemptQuotaStatus(attempt.quota_status, t) },
            { label: t('quotaReason'), value: formatOptionalText(attempt.quota_reason), title: formatOptionalText(attempt.quota_reason) },
            { label: t('capacityStatus'), value: formatAttemptCapacityStatus(attempt.capacity_status, t), title: formatAttemptCapacityStatus(attempt.capacity_status, t) },
            { label: t('capacityReason'), value: formatOptionalText(attempt.capacity_reason), title: formatOptionalText(attempt.capacity_reason) },
            { label: t('capacityScope'), value: formatOptionalText(attempt.capacity_scope), title: formatOptionalText(attempt.capacity_scope) },
            { label: t('capacitySource'), value: formatOptionalText(attempt.capacity_source), title: formatOptionalText(attempt.capacity_source) },
            { label: t('lastObservedAt'), value: formatOptionalDateTime(attempt.last_observed_at) },
            { label: t('expiresAt'), value: formatOptionalDateTime(attempt.expires_at) },
        ]
        : [];
    const queueRows = hasQueueMetadata(attempt)
        ? [
            { label: t('queueMode'), value: formatQueueMode(attempt.channel_concurrency_mode, t), title: formatQueueMode(attempt.channel_concurrency_mode, t) },
            { label: t('queueLimit'), value: hasNumber(attempt.channel_concurrency_limit) && attempt.channel_concurrency_limit > 0 ? String(attempt.channel_concurrency_limit) : '鈥?' },
            { label: t('queueWait'), value: formatOptionalDuration(attempt.channel_concurrency_wait_ms) },
            { label: t('queueOutcome'), value: formatQueueOutcome(attempt, t) },
        ]
        : [];
    const rows = [
        { label: t('attemptIndex'), value: formatAttemptIndex(attempt) },
        { label: t('site'), value: formatAttemptSite(attempt, target, t), title: formatAttemptSite(attempt, target, t) },
        { label: t('account'), value: formatAttemptAccount(attempt, target, t), title: formatAttemptAccount(attempt, target, t) },
        { label: t('channel'), value: formatEntity(t('channel'), attempt.channel_id, attempt.channel_name), title: formatEntity(t('channel'), attempt.channel_id, attempt.channel_name) },
        { label: t('key'), value: formatAttemptKey(attempt, t) },
        { label: t('upstreamModel'), value: attempt.upstream_model?.trim() || attempt.model_name || '—', title: attempt.upstream_model?.trim() || attempt.model_name },
        { label: t('httpStatus'), value: attempt.http_status ? String(attempt.http_status) : '—' },
        { label: t('retryable'), value: formatAttemptRetryable(attempt, t) },
        { label: t('firstTokenTime'), value: formatOptionalDuration(attempt.ttfb_ms) },
        { label: t('totalTime'), value: formatOptionalDuration(totalMS) },
        { label: t('tokenUsage'), value: formatAttemptTokens(attempt, t), title: formatAttemptTokens(attempt, t) },
        { label: t('costIncurred'), value: formatCostIncurred(attempt.cost_incurred, t) },
        { label: t('inputCost'), value: formatOptionalCost(attempt.input_cost) },
        { label: t('outputCost'), value: formatOptionalCost(attempt.output_cost) },
        { label: t('estimatedCost'), value: formatOptionalCost(attempt.estimated_cost) },
        { label: t('costSource'), value: formatCostSource(attempt.cost_source, t), title: formatCostSource(attempt.cost_source, t) },
        { label: t('serviceTier'), value: formatOptionalText(attempt.service_tier), title: formatOptionalText(attempt.service_tier) },
        { label: t('protocol'), value: formatProtocolPath(attempt), title: formatProtocolPath(attempt) },
        { label: t('baseUrl'), value: attempt.base_url?.trim() || '—', title: attempt.base_url?.trim() || undefined },
        ...capacityRows,
        ...queueRows,
        { label: t('startedAt'), value: formatOptionalDateTime(attempt.created_at) },
    ];

    return (
        <div className="flex flex-col gap-2">
            <TraceFieldGrid rows={rows} />
            {failureReason ? (
                <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
                    <div className="mb-1 text-[10px] font-medium text-muted-foreground">{t('failureReason')}</div>
                    <div className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word">
                        {failureReason}
                    </div>
                </div>
            ) : null}
            {errorSummary ? (
                <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
                    <div className="mb-1 text-[10px] font-medium text-muted-foreground">{t('errorSummary')}</div>
                    <div className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word">
                        {errorSummary}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function DeferredJsonContent({ content, fallbackText }: { content: string | undefined; fallbackText: string }) {
    const { resolvedTheme } = useTheme();
    const { isOpen } = useMorphingDialog();
    const [shouldRender, setShouldRender] = useState(false);

    const parsed = useMemo(() => {
        if (!shouldRender || !content) return { isJson: false, data: null };
        try {
            return { isJson: true, data: JSON.parse(content) };
        } catch {
            return { isJson: false, data: content };
        }
    }, [content, shouldRender]);

    useEffect(() => {
        let resetTimer: number | undefined;
        let renderTimer: number | undefined;

        if (!isOpen) {
            resetTimer = window.setTimeout(() => setShouldRender(false), 0);
            return () => {
                if (resetTimer !== undefined) window.clearTimeout(resetTimer);
            };
        }
        if (!content) {
            renderTimer = window.setTimeout(() => setShouldRender(true), 0);
            return () => {
                if (renderTimer !== undefined) window.clearTimeout(renderTimer);
            };
        }

        resetTimer = window.setTimeout(() => setShouldRender(false), 0);
        renderTimer = window.setTimeout(() => setShouldRender(true), 300);
        return () => {
            if (resetTimer !== undefined) window.clearTimeout(resetTimer);
            if (renderTimer !== undefined) window.clearTimeout(renderTimer);
        };
    }, [content, isOpen]);

    if (!isOpen) return null;

    if (!content) {
        return (
            <pre className="p-4 text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word leading-relaxed">
                {fallbackText}
            </pre>
        );
    }

    return (
        <AnimatePresence mode="wait">
            {!shouldRender ? (
                <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="p-4 flex items-center justify-center h-full"
                >
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </motion.div>
            ) : parsed.isJson ? (
                <motion.div
                    key="json"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-4"
                >
                    <JsonView
                        value={parsed.data as object}
                        style={{
                            ...(resolvedTheme === 'dark' ? githubDarkTheme : githubLightTheme),
                            fontSize: '12px',
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                            backgroundColor: 'transparent',
                        }}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        collapsed={false}
                    />
                </motion.div>
            ) : (
                <motion.pre
                    key="text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-4 text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word font-mono leading-relaxed"
                >
                    {content}
                </motion.pre>
            )}
        </AnimatePresence>
    );
}

function AttemptDisableButton({
    target,
    pending,
    onDisable,
}: {
    target: LogSiteActionTarget | null;
    pending: boolean;
    onDisable: (target: LogSiteActionTarget) => void;
}) {
    const t = useTranslations('log.card');

    if (!target?.canDisableModel) return null;

    const tooltipLabel = target.modelDisabled
        ? t('disabled')
        : pending
            ? t('disabling')
            : t('disableModel');

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    disabled={pending || target.modelDisabled}
                    onClick={() => onDisable(target)}
                    className={cn(
                        'inline-flex size-7 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60',
                        target.modelDisabled
                            ? 'text-destructive hover:bg-destructive/10'
                            : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                    )}
                >
                    {pending ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <CircleOff className="size-4" />
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
        </Tooltip>
    );
}

function DialogOpenBridge({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const { isOpen } = useMorphingDialog();

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    return null;
}

function DialogAutoOpenBridge({
    token,
    onConsumed,
}: {
    token?: string;
    onConsumed?: () => void;
}) {
    const { setIsOpen } = useMorphingDialog();

    useEffect(() => {
        if (!token) return;
        setIsOpen(true);
        onConsumed?.();
    }, [onConsumed, setIsOpen, token]);

    return null;
}

function getLogAttemptCount(log: RelayLog) {
    return log.attempts_count || log.total_attempts || log.attempts?.length || 0;
}

function getLogHTTPStatus(log: RelayLog) {
    const attempts = log.attempts ?? [];
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
        const status = attempts[index]?.http_status ?? 0;
        if (status > 0) return status;
    }
    return 0;
}

function getLogFailureReason(log: RelayLog) {
    const attempts = log.attempts ?? [];
    for (const attempt of attempts) {
        const reason = getAttemptFailureReason(attempt);
        if (reason) return reason;
    }
    return sanitizeErrorMessage(log.error);
}

function getLogProtocol(log: RelayLog) {
    const attempts = log.attempts ?? [];
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
        const attempt = attempts[index];
        const protocol = [attempt.request_protocol, attempt.upstream_protocol, attempt.response_protocol]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(' -> ');
        if (protocol) return protocol;
    }
    return log.used_ws ? 'ws' : '—';
}

function getLogCost(log: RelayLog) {
    if (hasNumber(log.total_attempt_cost) && log.total_attempt_cost > 0) return log.total_attempt_cost;
    if (hasNumber(log.final_success_cost) && log.final_success_cost > 0) return log.final_success_cost;
    return log.cost;
}

function formatTokPerSecond(log: RelayLog) {
    const duration = log.total_latency_ms || log.use_time;
    if (!duration || duration <= 0) return '—';
    const tokens = (log.output_tokens ?? 0) + (log.input_tokens ?? 0);
    if (tokens <= 0) return '—';
    return `${(tokens / (duration / 1000)).toFixed(1)}/s`;
}

function LogRowTriggerContent({
    log,
    displayActualModelName,
    requestAPIKeyName,
    hasError,
}: {
    log: RelayLog;
    displayActualModelName: string;
    requestAPIKeyName: string;
    hasError: boolean;
}) {
    const t = useTranslations('log.card');
    const statusLabel = formatFinalStatus(log.final_status || (hasError ? 'failed' : 'success'), t);
    const inputTokens = getHeadlineInputTokens(log);
    const totalTokens = (inputTokens ?? 0) + (log.output_tokens ?? 0);
    const isStream = log.request_stream;
    
    return (
        <div className="grid gap-3 px-3 py-2 text-sm lg:grid-cols-[minmax(50px,0.5fr)_minmax(120px,1.5fr)_minmax(50px,0.5fr)_minmax(60px,0.5fr)_minmax(90px,0.8fr)_minmax(80px,0.8fr)_minmax(80px,0.8fr)_minmax(60px,0.6fr)_minmax(120px,1.2fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(100px,0.8fr)_minmax(80px,0.6fr)_minmax(90px,0.8fr)] lg:items-center min-w-[1220px]">
            {/* 1. ID */}
            <div className="min-w-0 font-mono text-xs text-muted-foreground truncate" title={`#${log.id}`}>
                #{log.id}
            </div>

            {/* 2. 模型ID */}
            <div className="min-w-0">
                <div className="truncate font-medium text-foreground text-xs" title={log.request_model_name}>
                    {log.request_model_name}
                </div>
            </div>

            {/* 3. 流式 */}
            <div className="min-w-0">
                <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", isStream ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800" : "bg-muted text-muted-foreground")}>
                    {isStream ? '流式' : '非流式'}
                </Badge>
            </div>

            {/* 4. 来源 */}
            <div className="min-w-0">
                <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", log.request_source === 'relay' ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800" : "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800")}>
                    {formatRequestSource(log.request_source)}
                </Badge>
            </div>

            {/* 5. 客户端IP */}
            <div className="min-w-0 truncate text-xs text-muted-foreground">
                {formatClientIP(log.client_ip)}
            </div>

            {/* 6. 渠道 */}
            <div className="min-w-0 truncate text-xs text-muted-foreground" title={log.channel_name || `#${log.channel}`}>
                {log.channel_name || `#${log.channel}`}
            </div>

            {/* 7. API密钥 */}
            <div className="min-w-0 truncate text-xs text-muted-foreground" title={requestAPIKeyName}>
                {requestAPIKeyName || 'all'}
            </div>

            {/* 8. 状态 */}
            <div className="min-w-0">
                <span className={cn("text-xs font-medium truncate", hasError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    {statusLabel}
                </span>
            </div>

            {/* 9. 词元 */}
            <div className="min-w-0 text-muted-foreground">
                <div className="text-xs text-foreground font-medium tabular-nums truncate">总计: {totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</div>
                {totalTokens > 0 ? (
                    <div className="text-[10px] tabular-nums truncate">
                        输入: {inputTokens?.toLocaleString()} | 输出: {log.output_tokens?.toLocaleString()}
                    </div>
                ) : null}
            </div>

            {/* 10. 读缓存 */}
            <div className="min-w-0 tabular-nums text-xs text-muted-foreground truncate">
                {log.cache_read_tokens || '-'}
            </div>

            {/* 11. 写缓存 */}
            <div className="min-w-0 tabular-nums text-xs text-muted-foreground truncate">
                {log.cache_write_tokens || '-'}
            </div>

            {/* 12. 成本 */}
            <div className="min-w-0 tabular-nums text-xs text-emerald-600 dark:text-emerald-400 truncate">
                {getLogCost(log) > 0 ? getLogCost(log).toFixed(6) : '-'}
            </div>

            {/* 13. 耗时 */}
            <div className="min-w-0 text-muted-foreground truncate">
                <div className="text-xs text-foreground font-medium tabular-nums">{formatOptionalDuration(log.total_latency_ms || log.use_time)}</div>
                <div className="text-[10px] tabular-nums">TTFT: {formatOptionalDuration(log.ftut)}</div>
            </div>

            {/* 14. 详情 */}
            <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                    <MessageSquare className="size-3" />
                    查看详情
                </span>
            </div>

            {/* 15. 创建时间 */}
            <div className="min-w-0 tabular-nums text-xs text-muted-foreground truncate">
                {formatTime(log.time)}
            </div>
        </div>
    );
}

export function LogCard({
    log,
    siteTargets,
    variant = 'card',
    onDialogOpenChange,
    autoOpenToken,
    onAutoOpenConsumed,
}: {
    log: RelayLog;
    siteTargets: LogSiteActionTargets | null;
    variant?: 'card' | 'row';
    onDialogOpenChange?: (open: boolean) => void;
    autoOpenToken?: string;
    onAutoOpenConsumed?: () => void;
}) {
    const t = useTranslations('log.card');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const detailQuery = useLogDetail(log.id, isDialogOpen);
    const detailLog = detailQuery.data ?? log;
    const displayActualModelName = useMemo(
        () => log.actual_model_name?.trim() || log.request_model_name?.trim() || '',
        [log.actual_model_name, log.request_model_name],
    );
    const { Avatar: ModelAvatar, color: brandColor } = useMemo(
        () => getModelIcon(displayActualModelName),
        [displayActualModelName]
    );
    const requestAPIKeyName = useMemo(() => log.request_api_key_name?.trim() ?? '', [log.request_api_key_name]);
    const disableMutation = useUpdateSiteChannelModelDisabled();

    const hasError = !!log.error;
    const hasAttempts = (log.attempts?.length ?? 0) > 0;
    const hasMultipleAttempts = (log.attempts?.length ?? 0) > 1;
    const hasTraceData = hasTraceSummary(log);
    const [isDiagnosticExpanded, setIsDiagnosticExpanded] = useState(false);
    const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
    const [activeDisableTarget, setActiveDisableTarget] = useState<LogSiteActionTarget | null>(null);
    const [pendingDisableKey, setPendingDisableKey] = useState<string | null>(null);

    const attemptTargets = siteTargets?.attemptTargets ?? [];
    const legacyErrorTarget = siteTargets?.legacyErrorTarget ?? null;
    const showDiagnosticPanel = hasError || hasAttempts || hasTraceData;
    const diagnosticTitle = hasAttempts || hasTraceData ? t('traceDetails') : t('errorInfo');
    const diagnosticIcon = hasAttempts ? RotateCw : hasTraceData ? Info : AlertCircle;
    const DiagnosticIcon = diagnosticIcon;
    const handleDialogOpenChange = useCallback((open: boolean) => {
        setIsDialogOpen(open);
        onDialogOpenChange?.(open);
    }, [onDialogOpenChange]);

    const openDisableDialog = (target: LogSiteActionTarget) => {
        if (!target.canDisableModel || target.modelDisabled) return;
        setActiveDisableTarget(target);
        setConfirmDisableOpen(true);
    };

    const handleConfirmDisableOpenChange = (open: boolean) => {
        if (!open && disableMutation.isPending) return;
        setConfirmDisableOpen(open);
        if (!open) {
            setActiveDisableTarget(null);
        }
    };

    const confirmDisableModel = () => {
        if (!activeDisableTarget || !activeDisableTarget.canDisableModel || activeDisableTarget.modelDisabled) return;

        const target = activeDisableTarget;
        const targetKey = makeDisableTargetKey(target);
        setPendingDisableKey(targetKey);

        disableMutation.mutate(
            {
                siteId: target.siteId,
                accountId: target.accountId,
                payload: [
                    {
                        group_key: target.groupKey,
                        model_name: target.modelName,
                        disabled: true,
                    },
                ],
            },
            {
                onSuccess: () => {
                    setConfirmDisableOpen(false);
                    setActiveDisableTarget(null);
                    toast.success(`已禁用 ${target.groupName} / ${target.modelName}`);
                },
                onError: (error) => {
                    toast.error(error.message);
                },
                onSettled: () => {
                    setPendingDisableKey(null);
                },
            },
        );
    };

    const isDisablePending = (target: LogSiteActionTarget | null) => {
        if (!target || !pendingDisableKey) return false;
        return pendingDisableKey === makeDisableTargetKey(target);
    };

    const handleExportDetail = useCallback(() => {
        try {
            downloadJson(`octopus-log-detail-${detailLog.id}-${exportFilenameTimestamp()}.json`, buildSafeLogDetailExport(detailLog));
            toast.success(t('exportDetailSuccess'), { description: t('exportDetailSafe') });
        } catch (error) {
            toast.error(t('exportDetailFailed'), { description: error instanceof Error ? error.message : String(error) });
        }
    }, [detailLog, t]);

    return (
        <TooltipProvider>
            <MorphingDialog>
                <DialogOpenBridge onOpenChange={handleDialogOpenChange} />
                <DialogAutoOpenBridge token={autoOpenToken} onConsumed={onAutoOpenConsumed} />
                <MorphingDialogTrigger
                    className={cn(
                        variant === 'row'
                            ? 'rounded-lg border bg-card w-full text-left transition hover:bg-muted/40'
                            : 'fluent-card w-full text-left',
                        hasError ? 'border-destructive/40' : 'border-border',
                    )}
                >
                    {variant === 'row' ? (
                        <LogRowTriggerContent
                            log={log}
                            displayActualModelName={displayActualModelName}
                            requestAPIKeyName={requestAPIKeyName}
                            hasError={hasError}
                        />
                    ) : (
                        <div className={cn('p-4 grid grid-cols-[auto_1fr] gap-4', hasError ? 'items-start' : 'items-center')}>
                            <ModelAvatar size={40} />
                            <div className="min-w-0 flex flex-col gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                                    <span className="font-semibold text-card-foreground truncate" title={log.request_model_name}>
                                        {log.request_model_name}
                                    </span>
                                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                                    {hasMultipleAttempts ? (
                                        <RetryBadgeWithTooltip
                                            channelName={log.channel_name}
                                            brandColor={brandColor}
                                            attempts={log.attempts!}
                                        />
                                    ) : (
                                        <Badge
                                            variant="secondary"
                                            className="shrink-0 text-xs px-1.5 py-0"
                                            style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                                        >
                                            {log.channel_name}
                                        </Badge>
                                    )}
                                    <span className="text-muted-foreground truncate" title={displayActualModelName}>
                                        {displayActualModelName}
                                    </span>
                                    {log.attempts?.some((attempt) => attempt.sticky) ? (
                                        <Pin className="size-3.5 shrink-0 text-amber-500" />
                                    ) : null}
                                </div>
                                <WSModeBadge log={log} />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-7 gap-x-4 gap-y-2 text-xs tabular-nums text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="size-3.5 shrink-0" style={{ color: brandColor }} />
                                    <span>{formatTime(log.time)}</span>
                                </div>
                                {requestAPIKeyName ? (
                                    <div className="flex items-center gap-1.5">
                                        <KeyRound className="size-3.5 shrink-0 text-orange-500" />
                                        <span className="truncate" title={requestAPIKeyName}>
                                            {requestAPIKeyName}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="flex items-center gap-1.5">
                                    <Zap className="size-3.5 shrink-0 text-amber-500" />
                                    <span>{t('firstToken')} {formatDuration(log.ftut)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Cpu className="size-3.5 shrink-0 text-blue-500" />
                                    <span>{t('totalTime')} {formatDuration(log.use_time)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowDownToLine className="size-3.5 shrink-0 text-green-500" />
                                    <span className="flex items-center gap-1">
                                        <span>{t('input')} {getHeadlineInputTokens(log).toLocaleString()}</span>
                                        <InputTokenDetailsPopover log={log} />
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowUpFromLine className="size-3.5 shrink-0 text-purple-500" />
                                    <span>{t('output')} {log.output_tokens.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <DollarSign className="size-3.5 shrink-0 text-emerald-500" />
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                        {t('cost')} {Number(log.cost).toFixed(6)}
                                    </span>
                                </div>
                            </div>
                            {hasError ? (
                                <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 overflow-hidden">
                                    <p className="text-xs text-destructive line-clamp-2">{sanitizeErrorMessage(log.error)}</p>
                                </div>
                            ) : null}
                            </div>
                        </div>
                    )}
                </MorphingDialogTrigger>

                <MorphingDialogContainer>
                    <MorphingDialogContent className="relative w-[calc(100vw-2rem)] md:w-[80vw] bg-card text-card-foreground px-6 py-4 rounded-2xl h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
                        <MorphingDialogClose className="top-4 right-5 text-muted-foreground hover:text-foreground transition-colors" />
                        <MorphingDialogTitle className="mb-3 flex min-w-0 items-start gap-3 pr-14 text-sm md:pr-16">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <ModelAvatar size={28} />
                                <span className="font-semibold text-card-foreground truncate">{log.request_model_name}</span>
                                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                                {hasMultipleAttempts ? (
                                    <RetryBadgeWithTooltip
                                        channelName={log.channel_name}
                                        brandColor={brandColor}
                                        attempts={log.attempts!}
                                    />
                                ) : (
                                    <Badge
                                        variant="secondary"
                                        className="shrink-0 text-xs px-1.5 py-0"
                                        style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                                    >
                                        {log.channel_name}
                                    </Badge>
                                )}
                                <span className="text-muted-foreground truncate">{displayActualModelName}</span>
                                {log.attempts?.some((attempt) => attempt.sticky) ? (
                                    <Pin className="size-3.5 shrink-0 text-amber-500" />
                                ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleExportDetail}
                                    disabled={detailQuery.isFetching && !detailQuery.data}
                                    title={t('exportDetail')}
                                    aria-label={t('exportDetail')}
                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <ArrowDownToLine className="size-4" />
                                </button>
                                <WSModeBadge log={log} />
                            </div>
                        </MorphingDialogTitle>

                        <MorphingDialogDescription className="flex-1 min-h-0">
                            <div className="flex flex-col min-h-0 h-full gap-4">
                                {showDiagnosticPanel ? (
                                    <div
                                        className={cn(
                                            'flex-initial min-h-0 flex flex-col rounded-2xl border overflow-hidden max-h-[40%]',
                                            hasError
                                                ? 'bg-destructive/5 border-destructive/20'
                                                : 'bg-secondary/30 border-border/50',
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2.5 shrink-0 cursor-pointer select-none hover:bg-muted/50 transition-colors',
                                                hasError && 'hover:bg-destructive/10',
                                            )}
                                            onClick={() => setIsDiagnosticExpanded(!isDiagnosticExpanded)}
                                        >
                                            <DiagnosticIcon className={cn('size-4', hasError ? 'text-destructive' : 'text-muted-foreground')} />
                                            <span className={cn('text-sm font-medium', hasError ? 'text-destructive' : 'text-secondary-foreground')}>
                                                {diagnosticTitle}
                                            </span>
                                            <div className="ml-auto flex items-center gap-2">
                                                {hasAttempts ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-xs border-0',
                                                            hasError
                                                                ? 'bg-destructive/10 text-destructive'
                                                                : 'bg-secondary text-secondary-foreground',
                                                        )}
                                                    >
                                                        {log.attempts_count || log.total_attempts || log.attempts!.length} {t('attempts')}
                                                    </Badge>
                                                ) : null}
                                                {isDiagnosticExpanded ? (
                                                    <ChevronUp className="size-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronDown className="size-4 text-muted-foreground" />
                                                )}
                                            </div>
                                        </div>

                                        <AnimatePresence initial={false}>
                                            {isDiagnosticExpanded ? (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                    className="overflow-hidden flex flex-col min-h-0"
                                                >
                                                    <div className="flex-1 overflow-auto p-2.5 md:p-3 flex flex-col gap-4">
                                                        {hasError ? (
                                                            <div className="relative pl-1">
                                                                <div className="absolute right-0 top-0">
                                                                    <CopyIconButton
                                                                        text={log.error ?? ''}
                                                                        className="p-1 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                                        copyIconClassName="size-4"
                                                                        checkIconClassName="size-4"
                                                                    />
                                                                </div>
                                                                <p className="text-sm text-destructive whitespace-pre-wrap wrap-break-word pr-8 leading-relaxed">
                                                                    {sanitizeErrorMessage(log.error)}
                                                                </p>
                                                                {!hasAttempts && legacyErrorTarget ? (
                                                                    <div className="mt-3 flex justify-end">
                                                                        <AttemptDisableButton
                                                                            target={legacyErrorTarget}
                                                                            pending={isDisablePending(legacyErrorTarget)}
                                                                            onDisable={openDisableDialog}
                                                                        />
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : null}

                                                        {hasTraceData ? (
                                                            <TraceSummary log={log} />
                                                        ) : null}

                                                        {hasAttempts ? (
                                                            <div className="flex flex-col gap-2">
                                                                {(() => {
                                                                    const attemptsArr = log.attempts!;
                                                                    const merged = mergeAdjacentAttempts(attemptsArr);
                                                                    return merged.map((attempt, idx) => {
                                                                        const statusMeta = getAttemptStatusMeta(attempt.status, t);
                                                                        const attemptTarget = attemptTargets[attempt.originalIndex] ?? null;
                                                                        const canDisableAttempt = attempt.status === 'failed' && !!attemptTarget?.canDisableModel;

                                                                        return (
                                                                            <div
                                                                                key={`${attempt.attempt_num || idx}-${attempt.channel_id}-${attempt.model_name}-${idx}`}
                                                                                className={cn(
                                                                                    'text-xs p-2.5 rounded-xl border transition-colors flex flex-col gap-2',
                                                                                    statusMeta.containerClassName,
                                                                                )}
                                                                            >
                                                                                <div className="flex items-start gap-2">
                                                                                    <Badge
                                                                                        className={cn(
                                                                                            'h-5 shrink-0 px-1.5 text-[10px] font-bold uppercase shadow-none border-0',
                                                                                            statusMeta.badgeClassName,
                                                                                        )}
                                                                                    >
                                                                                        {statusMeta.label}
                                                                                    </Badge>
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="font-semibold text-foreground">
                                                                                                {attempt.channel_name}
                                                                                            </span>
                                                                                            <span className="text-muted-foreground truncate">
                                                                                                ({attempt.model_name})
                                                                                            </span>
                                                                                            {attempt.sticky ? (
                                                                                                <Pin className="size-3.5 shrink-0 text-amber-500" />
                                                                                            ) : null}
                                                                                            {attempt.repeat > 1 ? (
                                                                                                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold tabular-nums">
                                                                                                    ×{attempt.repeat}
                                                                                                </Badge>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="ml-auto flex items-center gap-2 shrink-0">
                                                                                        <span className="text-muted-foreground tabular-nums font-mono">
                                                                                            {formatDuration(attempt.totalDuration)}
                                                                                        </span>
                                                                                        {canDisableAttempt ? (
                                                                                            <AttemptDisableButton
                                                                                                target={attemptTarget}
                                                                                                pending={isDisablePending(attemptTarget)}
                                                                                                onDisable={openDisableDialog}
                                                                                            />
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                                <AttemptTraceDetails attempt={attempt} target={attemptTarget} />
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </motion.div>
                                            ) : null}
                                        </AnimatePresence>
                                    </div>
                                ) : null}

                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-0">
                                        <div className="flex flex-col rounded-2xl border border-border bg-muted/30 overflow-hidden min-h-0">
                                            <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b border-border bg-muted/50 shrink-0">
                                                <Send className="size-4 text-green-500" />
                                                <span className="text-sm font-medium text-card-foreground">{t('requestContent')}</span>
                                                <div className="ml-auto flex items-center gap-2">
                                                    <Badge variant="secondary" className="text-xs">
                                                        {getHeadlineInputTokens(log).toLocaleString()} {t('tokens')}
                                                    </Badge>
                                                    <CopyIconButton
                                                        text={detailLog.request_content ?? ''}
                                                        title={t('copyRequestContent')}
                                                        ariaLabel={t('copyRequestContent')}
                                                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                                        copyIconClassName="size-4"
                                                        checkIconClassName="size-4"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-auto min-h-0">
                                                <DeferredJsonContent
                                                    content={detailLog.request_content}
                                                    fallbackText={detailQuery.isFetching ? t('loadingDetails') : t('noRequestContent')}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col rounded-2xl border border-border bg-muted/30 overflow-hidden min-h-0">
                                            <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b border-border bg-muted/50 shrink-0">
                                                <MessageSquare className="size-4 text-purple-500" />
                                                <span className="text-sm font-medium text-card-foreground">{t('responseContent')}</span>
                                                <div className="ml-auto flex items-center gap-2">
                                                    <Badge variant="secondary" className="text-xs">
                                                        {log.output_tokens.toLocaleString()} {t('tokens')}
                                                    </Badge>
                                                    <CopyIconButton
                                                        text={detailLog.response_content ?? ''}
                                                        title={t('copyResponseContent')}
                                                        ariaLabel={t('copyResponseContent')}
                                                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                                        copyIconClassName="size-4"
                                                        checkIconClassName="size-4"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-auto min-h-0">
                                                <DeferredJsonContent
                                                    content={detailLog.response_content}
                                                    fallbackText={detailQuery.isFetching ? t('loadingDetails') : t('noResponseContent')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </MorphingDialogDescription>

                        <div className="flex flex-wrap items-center gap-3 md:gap-4 pt-4 mt-auto text-xs text-muted-foreground shrink-0">
                            <div className="flex items-center gap-1.5">
                                <Clock className="size-3.5" style={{ color: brandColor }} />
                                <span className="tabular-nums">{formatTime(log.time)}</span>
                            </div>
                            {requestAPIKeyName ? (
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <KeyRound className="size-3.5 shrink-0 text-orange-500" />
                                    <span className="truncate" title={requestAPIKeyName}>
                                        {requestAPIKeyName}
                                    </span>
                                </div>
                            ) : null}
                            <div className="flex items-center gap-1.5">
                                <Zap className="size-3.5 text-amber-500" />
                                <span>{t('firstTokenTime')}: {formatDuration(log.ftut)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Cpu className="size-3.5 text-blue-500" />
                                <span>{t('totalTime')}: {formatDuration(log.use_time)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <DollarSign className="size-3.5 text-emerald-500" />
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('cost')}: {Number(log.cost).toFixed(6)}
                                </span>
                            </div>
                        </div>
                    </MorphingDialogContent>
                </MorphingDialogContainer>
            </MorphingDialog>
            {activeDisableTarget?.canDisableModel ? (
                <AlertDialog open={confirmDisableOpen} onOpenChange={handleConfirmDisableOpenChange}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>确认禁用站点模型</AlertDialogTitle>
                            <AlertDialogDescription>
                                将在 {activeDisableTarget.siteName} / {activeDisableTarget.accountName} / {activeDisableTarget.groupName} 中禁用模型 {activeDisableTarget.modelName}。
                                禁用后对应投影渠道和分组会刷新为最新状态。
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={disableMutation.isPending}>取消</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmDisableModel}
                                disabled={disableMutation.isPending}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {disableMutation.isPending ? '禁用中...' : '确认禁用'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : null}
        </TooltipProvider>
    );
}
