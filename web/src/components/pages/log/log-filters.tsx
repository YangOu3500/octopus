'use client';

import { useTranslations } from 'next-intl';
import { Search, RefreshCw, Download, Trash2, SlidersHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

import { type LogState } from './use-log-state';

interface LogFiltersProps {
    state: LogState;
}

export function LogFilters({ state }: LogFiltersProps) {
    const t = useTranslations('log');

    const handleClearLogs = async () => {
        if (!window.confirm(t('clear.confirm'))) return;
        try {
            await state.clearLogsMutation.mutateAsync();
            toast.success(t('clear.success'));
        } catch (error) {
            toast.error(t('clear.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs shrink-0 flex flex-col gap-3">
            {/* Quick search and control line */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 min-w-[280px] max-w-md items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground/60" />
                        <Input
                            placeholder={t('filters.searchModelPlaceholder')}
                            value={state.modelFilter}
                            onChange={(e) => state.setModelFilter(e.target.value)}
                            className="h-9 pl-8 rounded-lg text-xs"
                        />
                    </div>
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground/60" />
                        <Input
                            placeholder={t('filters.searchTracePlaceholder')}
                            value={state.traceFilter}
                            onChange={(e) => state.setTraceFilter(e.target.value)}
                            className="h-9 pl-8 rounded-lg text-xs"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Time range */}
                    <Select value={state.timeRange} onValueChange={state.setTimeRange}>
                        <SelectTrigger className="h-9 w-[110px] rounded-lg text-xs">
                            <SelectValue placeholder={t('filters.timeRange')} />
                        </SelectTrigger>
                        <SelectContent className="text-xs">
                            <SelectItem value="1h">最近 1 小时</SelectItem>
                            <SelectItem value="6h">最近 6 小时</SelectItem>
                            <SelectItem value="12h">最近 12 小时</SelectItem>
                            <SelectItem value="24h">最近 24 小时</SelectItem>
                            <SelectItem value="3d">最近 3 天</SelectItem>
                            <SelectItem value="7d">最近 7 天</SelectItem>
                            <SelectItem value="all">所有时间</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Status filter */}
                    <Select value={state.statusFilter} onValueChange={state.setStatusFilter}>
                        <SelectTrigger className="h-9 w-[100px] rounded-lg text-xs">
                            <SelectValue placeholder={t('filters.status')} />
                        </SelectTrigger>
                        <SelectContent className="text-xs">
                            <SelectItem value="all">{t('filters.allStatus')}</SelectItem>
                            <SelectItem value="success">{t('filters.success')}</SelectItem>
                            <SelectItem value="failed">{t('filters.failed')}</SelectItem>
                            <SelectItem value="canceled">{t('filters.canceled')}</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Advanced filter button */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1.5 text-xs font-bold">
                                <SlidersHorizontal className="size-3.5" />
                                <span>{t('filters.advanced')}</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4 border border-border bg-card rounded-xl shadow-md text-xs" align="end">
                            <div className="grid gap-3">
                                <div className="space-y-1">
                                    <h4 className="font-bold leading-none text-foreground">{t('filters.moreFilters')}</h4>
                                    <p className="text-[10px] text-muted-foreground">{t('filters.filterDesc')}</p>
                                </div>
                                <div className="grid gap-2">
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="apiKeyFilter">{t('filters.apiKey')}</Label>
                                        <Input
                                            id="apiKeyFilter"
                                            value={state.apiKeyFilter}
                                            onChange={(e) => state.setApiKeyFilter(e.target.value)}
                                            placeholder={t('filters.apiKeyPlaceholder')}
                                            className="col-span-2 h-8 rounded-md"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="httpStatusFilter">{t('filters.httpStatus')}</Label>
                                        <Input
                                            id="httpStatusFilter"
                                            value={state.httpStatusFilter}
                                            onChange={(e) => state.setHttpStatusFilter(e.target.value)}
                                            placeholder={t('filters.httpStatusPlaceholder')}
                                            className="col-span-2 h-8 rounded-md"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="failureFilter">{t('filters.errorDesc')}</Label>
                                        <Input
                                            id="failureFilter"
                                            value={state.failureFilter}
                                            onChange={(e) => state.setFailureFilter(e.target.value)}
                                            placeholder={t('filters.errorDescPlaceholder')}
                                            className="col-span-2 h-8 rounded-md"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label>{t('filters.protocol')}</Label>
                                        <Select value={state.protocolFilter} onValueChange={state.setProtocolFilter}>
                                            <SelectTrigger className="col-span-2 h-8 rounded-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="text-xs">
                                                <SelectItem value="all">{t('filters.allProtocols')}</SelectItem>
                                                <SelectItem value="http">HTTP</SelectItem>
                                                <SelectItem value="websocket">WebSocket</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label>{t('filters.requestSource')}</Label>
                                        <Select value={state.sourceFilter} onValueChange={state.setSourceFilter}>
                                            <SelectTrigger className="col-span-2 h-8 rounded-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="text-xs">
                                                <SelectItem value="all">{t('filters.allSources')}</SelectItem>
                                                <SelectItem value="relay">Relay</SelectItem>
                                                <SelectItem value="model_test">模型测试</SelectItem>
                                                <SelectItem value="probe">健康探测</SelectItem>
                                                <SelectItem value="images">图像生成</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label>{t('filters.stream')}</Label>
                                        <Select value={state.streamFilter} onValueChange={state.setStreamFilter}>
                                            <SelectTrigger className="col-span-2 h-8 rounded-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="text-xs">
                                                <SelectItem value="all">{t('filters.allStream')}</SelectItem>
                                                <SelectItem value="true">{t('filters.streamTrue')}</SelectItem>
                                                <SelectItem value="false">{t('filters.streamFalse')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label>{t('filters.failover')}</Label>
                                        <Select value={state.failoverFilter} onValueChange={state.setFailoverFilter}>
                                            <SelectTrigger className="col-span-2 h-8 rounded-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="text-xs">
                                                <SelectItem value="all">{t('filters.allStream')}</SelectItem>
                                                <SelectItem value="true">{t('filters.failoverTrue')}</SelectItem>
                                                <SelectItem value="false">{t('filters.failoverFalse')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label>{t('filters.cacheHit')}</Label>
                                        <Select value={state.cacheHitFilter} onValueChange={state.setCacheHitFilter}>
                                            <SelectTrigger className="col-span-2 h-8 rounded-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="text-xs">
                                                <SelectItem value="all">{t('filters.allStream')}</SelectItem>
                                                <SelectItem value="true">{t('filters.cacheHitTrue')}</SelectItem>
                                                <SelectItem value="false">{t('filters.cacheHitFalse')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={state.resetFilters} className="w-full mt-1 h-8 rounded-md font-bold">
                                    {t('filters.reset')}
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Refresh control */}
                    <div className="flex items-center gap-2 border border-border rounded-lg h-9 px-2.5 bg-background/20">
                        <Switch
                            id="log-auto-refresh"
                            checked={state.autoRefresh}
                            onCheckedChange={state.setAutoRefresh}
                        />
                        <Label htmlFor="log-auto-refresh" className="cursor-pointer text-[10px] font-bold text-muted-foreground uppercase">
                            {t('filters.autoRefresh')}
                        </Label>
                        {state.autoRefresh && (
                            <Select value={state.refreshInterval} onValueChange={state.setRefreshInterval}>
                                <SelectTrigger className="h-6 w-[70px] ml-1 rounded bg-background border-none px-1 text-[10px] font-semibold">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="text-[10px]">
                                    <SelectItem value="2000">2s</SelectItem>
                                    <SelectItem value="5000">5s</SelectItem>
                                    <SelectItem value="10000">10s</SelectItem>
                                    <SelectItem value="30000">30s</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => state.logsQuery.refetch()}
                        disabled={state.logsQuery.isFetching}
                        className="h-9 rounded-lg px-2.5 font-bold"
                    >
                        {state.logsQuery.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={state.handleExportPage}
                        disabled={state.logsQuery.logs.length === 0}
                        className="h-9 rounded-lg gap-1.5 px-3 font-bold"
                    >
                        <Download className="size-3.5" />
                        <span>{t('list.export.button')}</span>
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogs}
                        disabled={state.clearLogsMutation.isPending}
                        className="h-9 rounded-lg gap-1.5 px-3 border-destructive/30 hover:bg-destructive/10 hover:text-destructive font-bold text-muted-foreground"
                    >
                        {state.clearLogsMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        <span>{t('clear.button')}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
