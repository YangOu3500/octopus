'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Activity,
    Loader2,
    RefreshCw,
    Download,
    X,
    Play,
    CheckCircle,
    Terminal,
} from 'lucide-react';
import type { ActiveRequestSnapshot, ActiveRequestEvent } from '@/api/endpoints/log';
import { formatDuration } from './log-utils';
import { cn } from '@/lib/utils';
import { type LogState } from './use-log-state';

interface ActiveDebugProps {
    open: boolean;
    onClose: () => void;
    state: LogState;
}

function getEventIcon(type: string) {
    switch (type) {
        case 'started':
            return <Play className="size-3 text-emerald-500 fill-emerald-500" />;
        case 'completed':
            return <CheckCircle className="size-3 text-blue-500" />;
        default:
            return <Activity className="size-3 text-muted-foreground" />;
    }
}

export function ActiveDebug({ open, onClose, state }: ActiveDebugProps) {
    const t = useTranslations('log.active');
    const { data, isFetching, isStreamConnected, streamError, recentEvents } = state.activeRequestsQuery;
    const items = data?.items ?? [];
    const total = data?.total ?? 0;

    const handleExport = () => {
        state.handleExportActiveDebug();
    };

    return (
        <div
            className={cn(
                "fixed top-0 right-0 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 ease-in-out transform flex flex-col text-xs",
                open ? "translate-x-0" : "translate-x-full"
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/80 shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">{t('title') || '活跃请求 Debug'}</h3>
                    <Badge variant={total > 0 ? 'secondary' : 'outline'} className="h-5 rounded-md px-1.5 font-bold">
                        {t('count', { count: total }) || `${total} 个运行中`}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={cn(
                            'h-5 rounded-md px-1.5 font-bold border-none',
                            isStreamConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        )}
                    >
                        {isStreamConnected ? 'SSE已连接' : '轮询中'}
                    </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => state.activeRequestsQuery.refetch()} className="h-8 w-8 p-0 rounded">
                        {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport} disabled={items.length === 0 && recentEvents.length === 0} className="h-8 w-8 p-0 rounded">
                        <Download className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded">
                        <X className="size-4" />
                    </Button>
                </div>
            </div>

            {/* Error banner if streamError */}
            {streamError && (
                <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-destructive font-semibold text-[10px]">
                    事件流连接已断开，已自动切换为轮询拉取
                </div>
            )}

            {/* Main Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Active Requests List */}
                <div className="space-y-2">
                    <div className="font-bold text-foreground">当前运行中请求</div>
                    {items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-muted-foreground font-semibold">
                            {t('empty') || '当前没有运行中的请求'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item: ActiveRequestSnapshot) => (
                                <div key={item.id} className="rounded-xl border border-border bg-background/20 p-3 flex flex-col gap-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-bold text-foreground truncate" title={item.request_model}>
                                                {item.request_model}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
                                                IP: {formatDuration(item.elapsed_ms)}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[9px] font-bold uppercase">
                                                {item.phase || '-'}
                                            </Badge>
                                            <div className="text-[10px] font-bold text-foreground font-mono mt-0.5">
                                                {formatDuration(item.elapsed_ms)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress routing log if exists */}
                                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-background/40 p-2 rounded-lg border border-border/30">
                                        <div className="truncate">
                                            <span className="text-muted-foreground/60">当前候选:</span>{' '}
                                            <span className="font-bold text-foreground/90">{item.channel_name || `- (#${item.channel_id || 0})`}</span>
                                        </div>
                                        <div className="truncate">
                                            <span className="text-muted-foreground/60">上游模型:</span>{' '}
                                            <span className="font-bold text-foreground/90">{item.model_name || '-'}</span>
                                        </div>
                                        <div className="col-span-2 truncate">
                                            <span className="text-muted-foreground/60">失败描述:</span>{' '}
                                            <span className="font-bold text-foreground/90">{item.last_failure_reason || '无'}</span>
                                        </div>
                                    </div>

                                    {/* Previews if stream/response is active */}
                                    {(item.request_preview || item.response_preview) && (
                                        <div className="space-y-1 font-mono text-[9px] leading-relaxed border-t border-border/30 pt-2">
                                            {item.request_preview && (
                                                <div className="truncate">
                                                    <span className="text-muted-foreground/50">请求:</span>{' '}
                                                    <span className="text-foreground/80">{item.request_preview}</span>
                                                </div>
                                            )}
                                            {item.response_preview && (
                                                <div className="truncate">
                                                    <span className="text-muted-foreground/50">响应:</span>{' '}
                                                    <span className="text-foreground/80">{item.response_preview}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Event log */}
                <div className="space-y-2">
                    <div className="font-bold text-foreground flex items-center justify-between">
                        <span>实时日志流</span>
                        <span className="text-[10px] text-muted-foreground/60 font-semibold">最多保留 20 条</span>
                    </div>
                    {recentEvents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-muted-foreground font-semibold">
                            {t('events.empty') || '开启实时刷新后会显示活跃请求事件'}
                        </div>
                    ) : (
                        <div className="border border-border/85 rounded-xl bg-background/25 overflow-hidden divide-y divide-border/60">
                            {recentEvents.map((event: ActiveRequestEvent, idx: number) => (
                                <div key={idx} className="p-2.5 hover:bg-muted/10 transition-colors flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {getEventIcon(event.type)}
                                        <Badge variant="outline" className="h-4 rounded px-1 text-[8px] font-bold uppercase shrink-0 border-none bg-muted/60 text-muted-foreground">
                                            {event.type}
                                        </Badge>
                                        <span className="truncate text-foreground font-semibold" title={event.snapshot?.request_model}>
                                            {event.snapshot?.request_model || 'System Check'}
                                        </span>
                                    </div>
                                    <div className="shrink-0 font-mono text-[9px] text-muted-foreground/60">
                                        {new Date(event.updated_at).toLocaleTimeString([], { hour12: false })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
export default ActiveDebug;
