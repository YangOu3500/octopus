'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import type { RelayLog } from '@/api/endpoints/log';
import {
    formatDuration,
    formatCost,
    formatDateTime,
    formatClientIP,
    statusBadgeClass,
} from './log-utils';
import { cn } from '@/lib/utils';

interface LogTableProps {
    logs: RelayLog[];
    total: number;
    isLoading: boolean;
    isFetching: boolean;
    hasMore: boolean;
    loadMore: () => void;
    onViewDetail: (id: number) => void;
}

export function LogTable({
    logs,
    total,
    isLoading,
    isFetching,
    hasMore,
    loadMore,
    onViewDetail,
}: LogTableProps) {
    const t = useTranslations('log');
    const containerRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: logs.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 48,
        overscan: 10,
    });

    const items = rowVirtualizer.getVirtualItems();

    // Check if we need to load more logs as user scrolls to the bottom
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollHeight - target.scrollTop - target.clientHeight < 150) {
            if (hasMore && !isFetching) {
                loadMore();
            }
        }
    };

    if (isLoading && logs.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground border rounded-xl bg-card">
                <RefreshCw className="size-6 animate-spin text-primary mb-2" />
                <span className="text-xs font-semibold">{t('list.loading')}</span>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground border rounded-xl bg-card">
                <AlertTriangle className="size-8 text-muted-foreground/60 mb-2" />
                <span className="text-xs font-semibold">{t('list.empty')}</span>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 border border-border bg-card rounded-xl shadow-xs overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[80px_1fr_60px_60px_100px_100px_70px_140px_80px_80px_130px_60px] gap-2 px-4 py-2 border-b border-border bg-muted/30 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider shrink-0 select-none">
                <span>{t('table.id')}</span>
                <span>{t('table.model')}</span>
                <span>{t('table.stream')}</span>
                <span>{t('table.source')}</span>
                <span>{t('table.ip')}</span>
                <span>{t('table.channel')}</span>
                <span>{t('table.status')}</span>
                <span>{t('table.tokens')}</span>
                <span>{t('table.cost')}</span>
                <span>{t('table.duration')}</span>
                <span>{t('table.time')}</span>
                <span className="text-right">{t('table.actions')}</span>
            </div>

            {/* Virtualized list body */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto select-text text-xs leading-normal"
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {items.map((virtualRow) => {
                        const log = logs[virtualRow.index];
                        if (!log) return null;

                        return (
                            <div
                                key={log.id}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                                className={cn(
                                    "grid grid-cols-[80px_1fr_60px_60px_100px_100px_70px_140px_80px_80px_130px_60px] gap-2 px-4 py-2.5 border-b border-border/40 items-center hover:bg-muted/15 transition-colors",
                                    virtualRow.index % 2 === 1 ? "bg-muted/5" : ""
                                )}
                            >
                                <span className="font-mono text-muted-foreground font-semibold">#{log.id}</span>
                                <div className="truncate pr-2">
                                    <div className="font-bold text-foreground truncate" title={log.request_model_name}>
                                        {log.request_model_name}
                                    </div>
                                    {log.actual_model_name && log.actual_model_name !== log.request_model_name && (
                                        <div className="text-[10px] text-muted-foreground/60 truncate font-medium">
                                            {log.actual_model_name}
                                        </div>
                                    )}
                                </div>
                                <span>
                                    {log.request_stream ? (
                                        <Badge variant="outline" className="h-4 rounded px-1 text-[8px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-none">
                                            STREAM
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="h-4 rounded px-1 text-[8px] font-bold bg-muted text-muted-foreground border-none">
                                            JSON
                                        </Badge>
                                    )}
                                </span>
                                <span className="font-medium text-muted-foreground/90">
                                    {log.request_source ? (t.has(`source.${log.request_source}`) ? t(`source.${log.request_source}`) : log.request_source) : '—'}
                                </span>
                                <span className="font-mono text-muted-foreground">{formatClientIP(log.client_ip)}</span>
                                <div className="truncate">
                                    <div className="truncate font-semibold text-foreground" title={log.channel_name}>
                                        {log.channel_name || '—'}
                                    </div>
                                    {log.channel > 0 && (
                                        <div className="text-[10px] text-muted-foreground/60 font-semibold font-mono">
                                            ID: {log.channel}
                                        </div>
                                    )}
                                </div>
                                <span>
                                    <Badge variant="outline" className={cn('h-4.5 rounded px-1.5 text-[9px] font-bold border-none', statusBadgeClass(log.final_status))}>
                                        {log.final_status ? (t.has(log.final_status.toLowerCase()) ? t(log.final_status.toLowerCase()) : log.final_status) : '—'}
                                    </Badge>
                                </span>
                                <div className="font-mono text-muted-foreground/90">
                                    <div className="font-bold">
                                        {(log.input_tokens + log.output_tokens).toLocaleString()}
                                    </div>
                                    <div className="text-[9px] text-muted-foreground/50">
                                        in {log.input_tokens.toLocaleString()} / out {log.output_tokens.toLocaleString()}
                                    </div>
                                </div>
                                <span className="font-mono text-muted-foreground/95 font-semibold">{formatCost(log.cost)}</span>
                                <div className="font-mono text-foreground font-semibold">
                                    {formatDuration(log.total_latency_ms || log.use_time)}
                                </div>
                                <span className="font-mono text-muted-foreground/80">{formatDateTime(log.time)}</span>
                                <div className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewDetail(log.id)}
                                        className="h-7 w-7 p-0 rounded-md hover:bg-muted/70"
                                    >
                                        <Eye className="size-3.5" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom count info */}
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex justify-between items-center shrink-0 select-none">
                <span>{t('list.total', { count: total.toLocaleString() })}</span>
                {isFetching && <span className="text-[9px] font-semibold text-primary animate-pulse">{t('list.fetching')}</span>}
                {hasMore && !isFetching && <span className="text-[9px] text-muted-foreground/60">{t('list.scrollLoad')}</span>}
                {!hasMore && <span className="text-[9px] text-muted-foreground/60">{t('list.allLoaded')}</span>}
            </div>
        </div>
    );
}
export default LogTable;
