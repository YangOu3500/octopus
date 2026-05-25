'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RequestTrace, RequestTraceAuditSummary } from '@/api/endpoints/traces';
import {
    formatDuration,
    formatCost,
    traceCost,
    totalTokens,
    sourceLabel,
    buildAuditBuckets,
    mapAuditBuckets,
} from './trace-utils';

interface TraceAuditPanelProps {
    traces: RequestTrace[];
    total: number;
    audit?: RequestTraceAuditSummary;
    isLoading: boolean;
    isError: boolean;
}

interface AuditBucket {
    key: string;
    label: string;
    count: number;
    cost: number;
    tokens: number;
}

function AuditList({ title, items, total }: { title: string; items: AuditBucket[]; total: number }) {
    return (
        <div className="min-w-0 flex flex-col h-full bg-background/10 rounded-lg p-2.5 border border-border/30">
            <div className="mb-2 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">{title}</div>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 flex-1">
                {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground/50 font-semibold">-</div>
                ) : (
                    items.map((item) => {
                        const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
                        return (
                            <div key={item.key} className="space-y-1">
                                <div className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
                                    <span className="min-w-0 flex-1 truncate font-bold text-foreground/80" title={item.label}>
                                        {item.label}
                                    </span>
                                    <span className="font-mono tabular-nums text-muted-foreground/90 font-bold">
                                        {item.count} <span className="opacity-40">/ {percent}%</span>
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted border border-border/10">
                                    <div
                                        className="h-full rounded-full bg-primary/80"
                                        style={{ width: `${Math.max(4, percent)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export function TraceAuditPanel({
    traces,
    total,
    audit,
    isLoading,
    isError,
}: TraceAuditPanelProps) {
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
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs text-xs">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-lg px-2 gap-1.5 border-border/80 bg-background/50 font-bold">
                    {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5 text-primary" />}
                    <span>{t('title')}</span>
                </Badge>
                <span className="text-[10px] text-muted-foreground/60 font-semibold">
                    {t('scope', { page: traces.length, matched: scopeTotal, total })}
                </span>
                {isError && (
                    <Badge variant="outline" className="h-7 border-amber-500/30 px-2 text-amber-700 dark:text-amber-300 rounded-lg">
                        {t('aggregateUnavailable')}
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border/45 pb-3 text-xs md:grid-cols-3 xl:grid-cols-6 font-medium text-muted-foreground/90">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('failed')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">{failed} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('failover')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">{failover} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('stream')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">{stream} / {scopeTotal}</div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('avgAttempts')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">{avgAttempts.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('avgLatency')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">{formatDuration(avgLatency)}</div>
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('costTokens')}</div>
                    <div className="mt-1 font-bold font-mono text-sm text-foreground tabular-nums">
                        {formatCost(totalCost)} <span className="text-[10px] text-muted-foreground font-semibold">/</span> {tokens.toLocaleString()}
                    </div>
                </div>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AuditList title={t('statusBreakdown')} items={statusBuckets} total={scopeTotal} />
                <AuditList title={t('sourceBreakdown')} items={sourceBuckets} total={scopeTotal} />
                <AuditList title={t('modelBreakdown')} items={modelBuckets} total={scopeTotal} />
                <AuditList title={t('serviceTierBreakdown')} items={serviceTierBuckets} total={scopeTotal} />
            </div>
        </div>
    );
}
export default TraceAuditPanel;
