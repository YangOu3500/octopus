'use client';

import { useTranslations } from 'next-intl';
import { GitBranch, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RequestTrace } from '@/api/endpoints/traces';
import {
    MAX_COMPARE_TRACES,
    formatDuration,
    formatCost,
    statusClass,
    traceCost,
    totalTokens,
} from './trace-utils';

interface TraceComparisonPanelProps {
    traces: RequestTrace[];
    onClear: () => void;
    onRemove: (traceId: string) => void;
    onFocus: (traceId: string) => void;
}

export function TraceComparisonPanel({
    traces,
    onClear,
    onRemove,
    onFocus,
}: TraceComparisonPanelProps) {
    const t = useTranslations('traces.compare');
    const tracesT = useTranslations('traces');

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
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs text-xs">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="h-7 rounded-lg px-2 gap-1 border-border/80 bg-background/50 font-bold">
                        <GitBranch className="size-3.5" />
                        <span>{t('title', { count: traces.length })}</span>
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/60 font-semibold">{t('hint', { count: MAX_COMPARE_TRACES })}</span>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg px-2 text-xs font-bold gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onClear}
                >
                    <X className="size-3.5" />
                    <span>{t('clear')}</span>
                </Button>
            </div>

            {/* Aggregated comparison stats */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 mb-3">
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t('fastest')}</div>
                    <div className="mt-1 truncate font-mono text-[11px] font-bold text-foreground" title={fastest?.trace_id}>
                        {fastest ? `${formatDuration(fastest.total_latency_ms)} / ${fastest.trace_id.split('-')[0]}...` : '-'}
                    </div>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t('slowest')}</div>
                    <div className="mt-1 truncate font-mono text-[11px] font-bold text-foreground" title={slowest?.trace_id}>
                        {slowest ? `${formatDuration(slowest.total_latency_ms)} / ${slowest.trace_id.split('-')[0]}...` : '-'}
                    </div>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t('failover')}</div>
                    <div className="mt-1 font-bold text-foreground font-mono">{failoverCount} / {traces.length}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/20 px-3 py-2">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t('costTokens')}</div>
                    <div className="mt-1 font-bold text-foreground font-mono">
                        {formatCost(costTotal)} / {tokenTotal.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Comparison table */}
            <div className="overflow-auto rounded-lg border border-border bg-card/50">
                <table className="w-full min-w-[840px] text-left text-xs">
                    <thead className="bg-muted/70 text-muted-foreground font-bold text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="px-3 py-2">{t('table.trace')}</th>
                            <th className="px-3 py-2">{t('table.status')}</th>
                            <th className="px-3 py-2">{t('table.route')}</th>
                            <th className="px-3 py-2">{t('table.attempts')}</th>
                            <th className="px-3 py-2">{t('table.latency')}</th>
                            <th className="px-3 py-2">{t('table.tokens')}</th>
                            <th className="px-3 py-2">{t('table.cost')}</th>
                            <th className="px-3 py-2 text-right pr-5">{t('table.action')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-medium">
                        {traces.map((trace) => (
                            <tr key={trace.trace_id || trace.id} className="hover:bg-muted/10 transition-colors">
                                <td className="max-w-[200px] px-3 py-2">
                                    <div className="truncate font-bold text-foreground" title={trace.client_model}>
                                        {trace.client_model || '-'}
                                    </div>
                                    <div className="truncate font-mono text-[10px] text-muted-foreground/50 font-semibold" title={trace.trace_id}>
                                        {trace.trace_id}
                                    </div>
                                </td>
                                <td className="px-3 py-2">
                                    <Badge variant="outline" className={cn('h-5 rounded-md px-1.5 text-[9px] font-bold border-none', statusClass(trace.final_status))}>
                                        {trace.final_status ? (tracesT.has(`status.${trace.final_status.toLowerCase()}`) ? tracesT(`status.${trace.final_status.toLowerCase()}`) : trace.final_status) : '-'}
                                    </Badge>
                                </td>
                                <td className="max-w-[200px] px-3 py-2">
                                    <div className="truncate font-bold text-foreground" title={trace.final_upstream_model || undefined}>
                                        {trace.final_upstream_model || '-'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/50 font-semibold">
                                        {t('routeIds', { channel: trace.final_channel_id || 0, site: trace.final_site_id || 0 })}
                                    </div>
                                </td>
                                <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{trace.attempts_count || 0}</td>
                                <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{formatDuration(trace.total_latency_ms)}</td>
                                <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{totalTokens(trace).toLocaleString()}</td>
                                <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{formatCost(traceCost(trace))}</td>
                                <td className="px-3 py-2 text-right pr-5">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 rounded-lg px-2 text-[10px] font-bold"
                                            onClick={() => onFocus(trace.trace_id)}
                                        >
                                            {t('focus')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 rounded-lg px-2 text-[10px] font-bold text-destructive hover:bg-destructive/5"
                                            onClick={() => onRemove(trace.trace_id)}
                                        >
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
export default TraceComparisonPanel;
