'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RequestTrace } from '@/api/endpoints/traces';
import {
    formatDuration,
    formatTokens,
    formatCost,
    formatTime,
    statusClass,
    sourceLabel,
} from './trace-utils';

interface TraceTableProps {
    items: RequestTrace[];
    selectedTraceId: string | null;
    compareTraceIds: string[];
    onSelect: (traceId: string) => void;
    onToggleCompare: (traceId: string, checked: boolean) => void;
}

export function TraceTable({
    items,
    selectedTraceId,
    compareTraceIds,
    onSelect,
    onToggleCompare,
}: TraceTableProps) {
    const t = useTranslations('traces');

    return (
        <div className="min-h-[24rem] overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
            <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-muted-foreground backdrop-blur-md">
                    <tr className="text-[10px] uppercase font-bold tracking-wider">
                        <th className="w-[48px] px-4 py-3">{t('table.compare')}</th>
                        <th className="px-4 py-3">{t('table.request')}</th>
                        <th className="px-4 py-3">{t('table.status')}</th>
                        <th className="px-4 py-3">{t('table.route')}</th>
                        <th className="px-4 py-3">{t('table.latency')}</th>
                        <th className="px-4 py-3">{t('table.tokens')}</th>
                        <th className="px-4 py-3">{t('table.cost')}</th>
                        <th className="px-4 py-3">{t('table.time')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                    {items.map((trace) => {
                        const active = trace.trace_id === selectedTraceId;
                        const compared = compareTraceIds.includes(trace.trace_id);
                        return (
                            <tr
                                key={trace.trace_id || trace.id}
                                className={cn(
                                    'cursor-pointer transition-colors hover:bg-muted/10',
                                    active && 'bg-primary/[0.04] text-foreground'
                                )}
                                onClick={() => onSelect(trace.trace_id)}
                            >
                                <td className="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={compared}
                                        aria-label={t('compare.selectTrace')}
                                        className="size-4 rounded border-border accent-primary/80 cursor-pointer"
                                        onChange={(event) => onToggleCompare(trace.trace_id, event.target.checked)}
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                </td>
                                <td className="max-w-[200px] px-4 py-3">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="truncate font-bold text-foreground" title={trace.client_model}>
                                            {trace.client_model || '-'}
                                        </span>
                                        {trace.request_stream && (
                                            <Badge
                                                variant="outline"
                                                className="h-4.5 rounded-full px-1.5 text-[8.5px] bg-blue-500/10 text-blue-500 border-none uppercase tracking-wide font-bold shrink-0"
                                            >
                                                {t('stream.stream')}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-semibold font-mono">
                                        <span className="truncate" title={trace.trace_id}>
                                            {trace.trace_id.split('-')[0]}...
                                        </span>
                                        <span className="text-border/40">•</span>
                                        <span>{sourceLabel(trace.request_source)}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            'h-5.5 rounded-md px-2 text-[10px] font-bold tracking-wide border-none',
                                            statusClass(trace.final_status)
                                        )}
                                    >
                                        {trace.final_status || '-'}
                                    </Badge>
                                </td>
                                <td className="max-w-[200px] px-4 py-3">
                                    <div className="truncate font-bold text-foreground" title={trace.final_upstream_model || undefined}>
                                        {trace.final_upstream_model || '-'}
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground/60 font-semibold">
                                        {t('ids.channelSite', { channel: trace.final_channel_id || 0, site: trace.final_site_id || 0 })}
                                        {(trace.attempts_count || 0) > 1 && (
                                            <span className="ml-1.5 text-amber-500 font-bold">
                                                ({trace.attempts_count}x)
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {formatDuration(trace.total_latency_ms)}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {formatTokens(trace)}
                                </td>
                                <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {formatCost(trace.total_attempt_cost || trace.estimated_cost)}
                                </td>
                                <td className="px-4 py-3 text-[10px] text-muted-foreground/80 whitespace-nowrap">
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
