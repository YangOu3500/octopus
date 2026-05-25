'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, ArrowRight, Download, Loader2 } from 'lucide-react';
import { useRequestTraceDetail, type RequestAttempt } from '@/api/endpoints/traces';
import { useNavStore } from '@/stores/nav';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    TRACE_EXPORT_VERSION,
    formatDuration,
    formatCost,
    formatAttemptTokens,
    statusClass,
    safeFilenamePart,
    exportFilenameTimestamp,
    exportTimestamp,
    downloadJson,
    sanitizeTraceForExport,
    sanitizeAttemptForExport,
    hasCapacityMetadata,
    hasQueueMetadata,
    protocolPath,
    type Translator,
} from './trace-utils';

interface TraceDetailProps {
    traceId: string | null;
}

function queueModeLabel(mode: string | undefined, t: Translator) {
    switch ((mode ?? '').trim()) {
        case 'database':
            return t('queueModeDatabase');
        case 'local':
            return t('queueModeLocal');
        default:
            return '-';
    }
}

function queueOutcomeLabel(attempt: RequestAttempt, t: Translator) {
    if (attempt.channel_concurrency_timed_out) return t('queueTimedOut');
    if (attempt.channel_concurrency_acquired) return t('queueAcquired');
    if (hasQueueMetadata(attempt)) return t('no');
    return '-';
}

function quotaStatusLabel(status: string | undefined, t: Translator) {
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

function capacityStatusLabel(status: string | undefined, t: Translator) {
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

export function TraceDetailPanel({ traceId }: TraceDetailProps) {
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
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground font-semibold">
                {t('empty')}
            </div>
        );
    }

    if (detailQuery.isLoading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-card">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (detailQuery.error || !detail) {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive">
                {t('loadFailed')}
            </div>
        );
    }

    const trace = detail.trace;

    return (
        <aside className="flex max-h-[calc(100dvh-3rem)] min-w-0 self-start flex-col gap-3 rounded-xl border border-border bg-card p-4 overflow-y-auto xl:sticky xl:top-3 shadow-xs text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                        <GitBranch className="size-4 text-primary" />
                        <span>{t('title')}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80 font-semibold" title={trace.trace_id}>
                        {trace.trace_id}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {trace.relay_log_id ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-xs font-bold gap-1 px-2.5"
                            onClick={() => openLogTarget({ logId: trace.relay_log_id, traceId: trace.trace_id })}
                        >
                            <span>{t('openLog')}</span>
                            <ArrowRight className="size-3.5" />
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs font-bold gap-1 px-2.5"
                        onClick={handleExportDetail}
                    >
                        <Download className="size-3.5" />
                        <span>{tExport('detail')}</span>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{t('clientModel')}</div>
                    <div className="mt-1 truncate font-bold text-foreground" title={trace.client_model}>{trace.client_model || '-'}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{t('finalStatus')}</div>
                    <Badge variant="outline" className={cn('mt-1 h-5 rounded-md px-1.5 text-[9px] font-bold border-none', statusClass(trace.final_status))}>
                        {trace.final_status || '-'}
                    </Badge>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{t('latency')}</div>
                    <div className="mt-1 font-bold text-foreground font-mono">{formatDuration(trace.total_latency_ms)}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{t('cost')}</div>
                    <div className="mt-1 font-bold text-foreground font-mono">{formatCost(trace.total_attempt_cost || trace.estimated_cost)}</div>
                </div>
            </div>

            <div className="mt-2">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('attemptTimeline')}</div>
                <div className="relative pl-3 ml-1.5 space-y-3 border-l border-border/30">
                    {detail.attempts.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground font-semibold">
                            {t('noAttempts')}
                        </div>
                    ) : detail.attempts.map((attempt, index) => (
                        <div key={`${attempt.id}-${index}`} className="relative rounded-xl border border-border/40 bg-background/30 px-3 py-3 hover:border-primary/10 hover:bg-background/50 transition-all duration-150">
                            {/* Branch indicator */}
                            <span className="absolute -left-[18.5px] top-4.5 size-2.5 rounded-full border border-border/50 bg-card flex items-center justify-center z-10 shadow-xs">
                                <span className={cn("size-1.5 rounded-full", attempt.status === 'success' ? 'bg-emerald-500' : 'bg-destructive')} />
                            </span>

                            <div className="flex flex-wrap items-start gap-2">
                                <Badge variant="outline" className={cn('h-5 rounded-md px-1.5 text-[9px] font-bold uppercase tracking-wider border-none', statusClass(attempt.status))}>
                                    {attempt.status || '-'}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-bold text-foreground" title={attempt.channel_name || undefined}>
                                        {attempt.channel_name || t('channelFallback', { id: attempt.channel_id || 0 })}
                                    </div>
                                    <div className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground/60" title={attempt.upstream_model || attempt.model_name || undefined}>
                                        {attempt.model_name || '-'} {'->'} {attempt.upstream_model || '-'}
                                    </div>
                                </div>
                                <div className="text-right font-mono tabular-nums text-muted-foreground/90 leading-tight">
                                    <div className="font-bold text-foreground">{formatDuration(attempt.total_ms || attempt.duration_ms)}</div>
                                    <div className="text-[9px] mt-0.5">TTFB {formatDuration(attempt.ttfb_ms)}</div>
                                </div>
                            </div>

                            <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-muted-foreground/80 leading-normal">
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('http')}</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">{attempt.http_status || '-'}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('key')}</span>
                                    <div className="font-bold text-foreground/90 mt-0.5">{attempt.key_id || attempt.channel_key_id ? `#${attempt.key_id || attempt.channel_key_id}` : '-'}</div>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('siteAccount')}</span>
                                    <div className="font-bold text-foreground/90 mt-0.5 truncate" title={attempt.site_account_id ? `Site #${attempt.site_id} / Acc #${attempt.site_account_id}` : undefined}>
                                        {t('siteAccountValue', { site: attempt.site_id || 0, account: attempt.account_id || attempt.site_account_id || 0 })}
                                    </div>
                                </div>
                                {hasCapacityMetadata(attempt) && (
                                    <>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('quotaStatus')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5">{quotaStatusLabel(attempt.quota_status, t)}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('quotaReason')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5 truncate" title={attempt.quota_reason || undefined}>{attempt.quota_reason || '-'}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('capacityStatus')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5">{capacityStatusLabel(attempt.capacity_status, t)}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('capacityReason')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5 truncate" title={attempt.capacity_reason || undefined}>{attempt.capacity_reason || '-'}</div>
                                        </div>
                                    </>
                                )}
                                {hasQueueMetadata(attempt) && (
                                    <>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('queueMode')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5">{queueModeLabel(attempt.channel_concurrency_mode, t)}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('queueLimit')}</span>
                                            <div className="font-bold text-foreground/90 font-mono mt-0.5">{attempt.channel_concurrency_limit || '-'}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('queueWait')}</span>
                                            <div className="font-bold text-foreground/90 font-mono mt-0.5">{formatDuration(attempt.channel_concurrency_wait_ms)}</div>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('queueOutcome')}</span>
                                            <div className="font-bold text-foreground/90 mt-0.5">{queueOutcomeLabel(attempt, t)}</div>
                                        </div>
                                    </>
                                )}
                                <div className="col-span-2">
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('tokens')}</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">{formatAttemptTokens(attempt)}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('cost')}</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">{formatCost(attempt.estimated_cost)}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">{t('protocol')}</span>
                                    <div className="font-bold text-foreground/90 mt-0.5 truncate" title={protocolPath(attempt)}>{protocolPath(attempt)}</div>
                                </div>
                            </div>

                            {attempt.failure_reason || attempt.error_summary ? (
                                <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[10.5px] text-destructive leading-relaxed">
                                    <div className="font-bold">{attempt.failure_reason || '-'}</div>
                                    {attempt.error_summary && (
                                        <div className="mt-1 break-words text-destructive/80 font-semibold font-mono">{attempt.error_summary}</div>
                                    )}
                                </div>
                            ) : null}

                            {attempt.base_url && (
                                <div className="mt-2 truncate text-[10px] text-muted-foreground/50 font-semibold" title={attempt.base_url}>
                                    {t('baseUrl')}: {attempt.base_url}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
export default TraceDetailPanel;
