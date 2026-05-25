'use client';

import { useTranslations } from 'next-intl';
import { useLogDetail } from '@/api/endpoints/log';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Copy, Terminal } from 'lucide-react';
import { LogAttempts } from './log-attempts';
import {
    formatDuration,
    formatCost,
    formatDateTime,
    formatClientIP,
    downloadJson,
    LOG_DETAIL_EXPORT_VERSION,
    statusBadgeClass,
} from './log-utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import JsonView from '@uiw/react-json-view';
import { githubDarkTheme } from '@uiw/react-json-view/githubDark';
import { useTheme } from 'next-themes';

interface LogDetailProps {
    logId: number | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function JsonOrText({ value, title }: { value: string | undefined; title: string }) {
    const t = useTranslations('log.card');
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!value) {
        return (
            <div className="text-center py-8 text-xs text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border/80">
                {t('noContent', { title })}
            </div>
        );
    }

    let parsed: unknown = null;
    try {
        parsed = JSON.parse(value);
    } catch {
        // Not valid JSON
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        toast.success(t('copied', { title }));
    };

    return (
        <div className="relative border border-border rounded-xl bg-background/50 overflow-hidden flex flex-col max-h-[350px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{title}</span>
                <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 w-6 p-0 rounded">
                    <Copy className="size-3.5" />
                </Button>
            </div>
            <div className="p-3 overflow-auto text-xs font-mono select-text">
                {parsed ? (
                    <JsonView
                        value={parsed as object}
                        style={{
                            ...(isDark ? githubDarkTheme : {}),
                            backgroundColor: 'transparent',
                        }}
                        collapsed={2}
                    />
                ) : (
                    <pre className="whitespace-pre-wrap leading-relaxed text-foreground/90">{value}</pre>
                )}
            </div>
        </div>
    );
}

export function LogDetail({ logId, open, onOpenChange }: LogDetailProps) {
    const t = useTranslations('log.card');
    const { data: log, isLoading, error } = useLogDetail(logId ?? undefined, open && !!logId);

    const handleExport = () => {
        if (!log) return;
        try {
            downloadJson(`octopus-log-detail-${log.id}-${new Date().getTime()}.json`, {
                export_version: LOG_DETAIL_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                safety: {
                    content: 'server_redacted_request_response_detail',
                    excludes: ['full api key', 'cookie', 'authorization', 'bearer token'],
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
                    total_latency_ms: log.total_latency_ms,
                    input_tokens: log.input_tokens,
                    output_tokens: log.output_tokens,
                    cache_tokens: log.cache_tokens,
                    estimated_cost: log.estimated_cost,
                    error: log.error,
                    request_content: log.request_content,
                    response_content: log.response_content,
                    attempts: log.attempts,
                },
            });
            toast.success(t('exportDetailSuccess') || '导出详情成功');
        } catch {
            toast.error(t('exportDetailFailed') || '导出详情失败');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col p-0 gap-0 border border-border bg-card shadow-lg rounded-2xl overflow-hidden text-xs">
                <DialogHeader className="p-4 border-b border-border/60 flex flex-row items-center justify-between gap-4">
                    <div className="min-w-0">
                        <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <Terminal className="size-4 text-primary" />
                            <span>{t('logDetails')} #{logId}</span>
                        </DialogTitle>
                        <DialogDescription className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[500px]">
                            {log?.trace_id ? `Trace: ${log.trace_id}` : t('loadingDetails')}
                        </DialogDescription>
                    </div>
                    {log && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            className="h-8 rounded-lg text-xs gap-1.5 px-3 font-bold shrink-0 mr-6"
                        >
                            <Download className="size-3.5" />
                            <span>{t('exportDetail')}</span>
                        </Button>
                    )}
                </DialogHeader>

                {isLoading && (
                    <div className="flex flex-col items-center justify-center p-12 gap-2 text-muted-foreground">
                        <Loader2 className="size-6 animate-spin text-primary" />
                        <span className="font-semibold text-xs">{t('loadingDetails') || '正在加载详情...'}</span>
                    </div>
                )}

                {error && (
                    <div className="p-6 text-center text-destructive font-semibold">
                        {t('failedToLoadDetails')}
                    </div>
                )}

                {log && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Summary grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-border/50 bg-background/25 rounded-xl p-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{t('clientRequestModel')}</span>
                                <span className="font-bold text-foreground truncate" title={log.request_model_name}>{log.request_model_name}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{t('finalStatus')}</span>
                                <Badge variant="outline" className={`w-fit h-5 rounded-md px-1.5 text-[9px] font-bold uppercase ${statusBadgeClass(log.final_status)}`}>
                                    {log.final_status ? (t.has(log.final_status.toLowerCase()) ? t(log.final_status.toLowerCase()) : log.final_status) : '—'}
                                </Badge>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{t('totalLatency')}</span>
                                <span className="font-bold text-foreground font-mono">{formatDuration(log.total_latency_ms || log.use_time)}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{t('cost')}</span>
                                <span className="font-bold text-foreground font-mono">{formatCost(log.cost)}</span>
                            </div>
                        </div>

                        {/* Detail tabs */}
                        <Tabs defaultValue="payload" className="w-full flex flex-col gap-3">
                            <TabsList className="grid grid-cols-3 h-8 w-fit bg-muted p-0.5 rounded-lg border">
                                <TabsTrigger value="payload" className="text-xs h-7 rounded px-4 font-bold">{t('payloadTab')}</TabsTrigger>
                                <TabsTrigger value="attempts" className="text-xs h-7 rounded px-4 font-bold">{t('attemptsTab', { count: log.attempts?.length || 0 })}</TabsTrigger>
                                <TabsTrigger value="meta" className="text-xs h-7 rounded px-4 font-bold">{t('metaTab')}</TabsTrigger>
                            </TabsList>

                            {/* Payload tab */}
                            <TabsContent value="payload" className="space-y-3 mt-0 focus-visible:outline-none">
                                <JsonOrText value={log.request_content} title={t('requestContent') || '请求内容'} />
                                <JsonOrText value={log.response_content} title={t('responseContent') || '响应内容'} />
                                {log.error && (
                                    <div className="border border-destructive/20 bg-destructive/5 rounded-xl p-3 text-destructive font-semibold">
                                        <div className="font-bold mb-1">{t('errorLog')}</div>
                                        <pre className="font-mono whitespace-pre-wrap leading-relaxed text-[10.5px]">{log.error}</pre>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Attempts tab */}
                            <TabsContent value="attempts" className="mt-0 focus-visible:outline-none">
                                <LogAttempts attempts={log.attempts || []} />
                            </TabsContent>

                            {/* Metadata tab */}
                            <TabsContent value="meta" className="mt-0 focus-visible:outline-none">
                                <div className="border border-border/80 rounded-xl divide-y divide-border/60 overflow-hidden bg-background/20">
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('traceId')}</span>
                                        <span className="col-span-2 font-mono text-foreground select-all">{log.trace_id || '—'}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('threadId')}</span>
                                        <span className="col-span-2 font-mono text-foreground select-all">{log.thread_id || '—'}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('createdAt')}</span>
                                        <span className="col-span-2 text-foreground font-mono">{formatDateTime(log.time)}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('clientIP')}</span>
                                        <span className="col-span-2 text-foreground font-mono">{formatClientIP(log.client_ip)}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('clientApiKeyId')}</span>
                                        <span className="col-span-2 text-foreground font-mono">#{log.client_api_key_id || '—'}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('channel')}</span>
                                        <span className="col-span-2 text-foreground">{log.channel_name || '—'} (#{log.channel})</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('protocol')}</span>
                                        <span className="col-span-2 text-foreground">{log.request_stream ? `${t('yes')} (Stream)` : `${t('no')} (JSON)`}</span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('requestSource')}</span>
                                        <span className="col-span-2 text-foreground">
                                            {log.request_source ? (t.has(`source.${log.request_source}`) ? t(`source.${log.request_source}`) : log.request_source) : '—'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 p-2.5">
                                        <span className="font-bold text-muted-foreground/70">{t('tokenUsage')}</span>
                                        <span className="col-span-2 text-foreground font-mono">
                                            {t('inputShort')} {log.input_tokens?.toLocaleString() || 0} / {t('outputShort')} {log.output_tokens?.toLocaleString() || 0}
                                            {log.cache_tokens ? ` / ${t('cacheShort')} ${log.cache_tokens?.toLocaleString()}` : ''}
                                        </span>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
export default LogDetail;
