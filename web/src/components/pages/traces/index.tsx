'use client';

import { useTranslations } from 'next-intl';
import {
    Database,
    ShieldAlert,
    GitBranch,
    Timer,
    Search,
    RefreshCw,
    Download,
    Loader2,
    ArrowLeft,
    ArrowRight,
    X,
} from 'lucide-react';

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

import { useTraceState } from './use-trace-state';
import { TraceTable } from './trace-table';
import { TraceDetailPanel } from './trace-detail';
import { TraceComparisonPanel } from './trace-compare';
import { TraceAuditPanel } from './trace-audit';
import { formatCount, formatDuration } from './trace-utils';

interface SummaryTileProps {
    label: string;
    value: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
}

function SummaryTile({ label, value, sub, icon: Icon }: SummaryTileProps) {
    return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs text-xs">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-bold text-muted-foreground/60 uppercase">{label}</div>
                <Icon className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</div>
            <div className="mt-1 truncate font-semibold text-[10px] text-muted-foreground/60" title={sub}>
                {sub}
            </div>
        </div>
    );
}

export function Traces() {
    const t = useTranslations('traces');
    const state = useTraceState();

    return (
        <div className="flex flex-col gap-4 text-sm h-full min-h-0 p-6 overflow-y-auto">
            <div className="flex flex-col gap-1 shrink-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
                <p className="text-xs text-muted-foreground/80 font-medium">{t('description')}</p>
            </div>

            {/* Aggregated Tiles */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
                <SummaryTile
                    label={t('summary.total')}
                    value={formatCount(state.total)}
                    sub={t('summary.page', { count: state.traces.length })}
                    icon={Database}
                />
                <SummaryTile
                    label={t('summary.success')}
                    value={`${state.summary.success}/${state.traces.length}`}
                    sub={t('summary.failed', { count: state.summary.failed })}
                    icon={ShieldAlert}
                />
                <SummaryTile
                    label={t('summary.failover')}
                    value={formatCount(state.summary.failover)}
                    sub={t('summary.failoverSub')}
                    icon={GitBranch}
                />
                <SummaryTile
                    label={t('summary.latency')}
                    value={formatDuration(state.summary.avgLatency)}
                    sub={t('summary.latencySub')}
                    icon={Timer}
                />
            </div>

            {/* Filters & Control Panel */}
            <div className="rounded-xl border border-border bg-card p-3 shadow-2xs shrink-0 flex flex-col gap-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between border-b border-border/50 pb-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="outline" className="h-7 rounded-lg px-2.5 font-bold border-border/80 bg-background/50">
                            {t('title')}
                        </Badge>
                        {state.tracesQuery.error && (
                            <Badge variant="outline" className="h-7 border-destructive/30 px-2 text-destructive font-bold bg-destructive/5">
                                {t('loadFailed')}
                            </Badge>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-2.5 h-8 text-[11px] font-bold text-muted-foreground">
                            <Switch checked={state.autoRefresh} onCheckedChange={state.setAutoRefresh} className="scale-75 origin-right" />
                            <span>{t('autoRefresh')}</span>
                        </div>
                        <Select value={state.refreshInterval} onValueChange={state.setRefreshInterval}>
                            <SelectTrigger className="w-24 h-8 rounded-lg text-xs font-semibold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5000" className="text-xs">{t('interval.5s')}</SelectItem>
                                <SelectItem value="10000" className="text-xs">{t('interval.10s')}</SelectItem>
                                <SelectItem value="30000" className="text-xs">{t('interval.30s')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs font-bold gap-1.5"
                            onClick={state.refetchAll}
                            disabled={state.tracesQuery.isFetching || state.auditQuery.isFetching}
                        >
                            {state.tracesQuery.isFetching || state.auditQuery.isFetching ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : (
                                <RefreshCw className="size-4" />
                            )}
                            <span>{t('refresh')}</span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs font-bold gap-1.5"
                            onClick={state.handleExportPage}
                            disabled={state.traces.length === 0}
                        >
                            <Download className="size-4" />
                            <span>{t('export.page')}</span>
                        </Button>
                    </div>
                </div>

                {/* Filter Inputs Grid */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                            value={state.modelFilter}
                            onChange={(event) => {
                                state.resetTraceListPosition();
                                state.setModelFilter(event.target.value);
                            }}
                            placeholder={t('filters.model')}
                            className="pl-8 h-8 rounded-lg text-xs bg-background/50"
                        />
                    </div>
                    <Input
                        value={state.traceFilter}
                        onChange={(event) => {
                            state.resetTraceListPosition();
                            state.setTraceFilter(event.target.value);
                        }}
                        placeholder={t('filters.trace')}
                        className="h-8 rounded-lg text-xs bg-background/50"
                    />
                    <Input
                        value={state.httpStatusFilter}
                        onChange={(event) => {
                            state.resetTraceListPosition();
                            state.setHTTPStatusFilter(event.target.value);
                        }}
                        placeholder={t('filters.http')}
                        className="h-8 rounded-lg text-xs bg-background/50"
                    />
                    <Input
                        value={state.failureFilter}
                        onChange={(event) => {
                            state.resetTraceListPosition();
                            state.setFailureFilter(event.target.value);
                        }}
                        placeholder={t('filters.failure')}
                        className="h-8 rounded-lg text-xs bg-background/50"
                    />
                    <Select value={state.timeRange} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setTimeRange(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h" className="text-xs">{t('range.1h')}</SelectItem>
                            <SelectItem value="24h" className="text-xs">{t('range.24h')}</SelectItem>
                            <SelectItem value="7d" className="text-xs">{t('range.7d')}</SelectItem>
                            <SelectItem value="30d" className="text-xs">{t('range.30d')}</SelectItem>
                            <SelectItem value="all" className="text-xs">{t('range.all')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={state.statusFilter} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setStatusFilter(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">{t('status.all')}</SelectItem>
                            <SelectItem value="success" className="text-xs">{t('status.success')}</SelectItem>
                            <SelectItem value="failed" className="text-xs">{t('status.failed')}</SelectItem>
                            <SelectItem value="canceled" className="text-xs">{t('status.canceled')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={state.sourceFilter} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setSourceFilter(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">{t('source.all')}</SelectItem>
                            <SelectItem value="relay" className="text-xs">{t('source.relay')}</SelectItem>
                            <SelectItem value="model_test" className="text-xs">{t('source.model_test')}</SelectItem>
                            <SelectItem value="images" className="text-xs">{t('source.images')}</SelectItem>
                            <SelectItem value="probe" className="text-xs">{t('source.probe')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={state.streamFilter} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setStreamFilter(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">{t('stream.all')}</SelectItem>
                            <SelectItem value="true" className="text-xs">{t('stream.stream')}</SelectItem>
                            <SelectItem value="false" className="text-xs">{t('stream.nonStream')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={state.failoverFilter} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setFailoverFilter(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">{t('failover.all')}</SelectItem>
                            <SelectItem value="true" className="text-xs">{t('failover.yes')}</SelectItem>
                            <SelectItem value="false" className="text-xs">{t('failover.no')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={state.protocolFilter} onValueChange={(value) => {
                        state.resetTraceListPosition();
                        state.setProtocolFilter(value);
                    }}>
                        <SelectTrigger className="w-full h-8 rounded-lg text-xs font-semibold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">{t('protocol.all')}</SelectItem>
                            <SelectItem value="openai_chat" className="text-xs">OpenAI Chat</SelectItem>
                            <SelectItem value="openai_responses" className="text-xs">OpenAI Responses</SelectItem>
                            <SelectItem value="anthropic" className="text-xs">Anthropic</SelectItem>
                            <SelectItem value="gemini" className="text-xs">Gemini</SelectItem>
                            <SelectItem value="ws" className="text-xs">WebSocket</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-xs font-bold gap-1 text-muted-foreground hover:text-foreground"
                        onClick={state.resetFilters}
                    >
                        <X className="size-4" />
                        <span>{t('reset')}</span>
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs font-bold gap-1"
                            disabled={state.page <= 1 || state.tracesQuery.isFetching}
                            onClick={() => {
                                state.setSelectedTraceId(null);
                                state.setCompareTraceIds([]);
                                state.setPage((current) => Math.max(1, current - 1));
                            }}
                        >
                            <ArrowLeft className="size-4" />
                            <span>{t('pager.prev')}</span>
                        </Button>
                        <Badge variant="outline" className="h-8 rounded-lg px-3 font-mono font-bold border-border/80 bg-background/50">
                            {t('pager.page', { page: state.page, total: state.maxPage })}
                        </Badge>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs font-bold gap-1"
                            disabled={!state.hasMore || state.tracesQuery.isFetching}
                            onClick={() => {
                                state.setSelectedTraceId(null);
                                state.setCompareTraceIds([]);
                                state.setPage((current) => current + 1);
                            }}
                        >
                            <span>{t('pager.next')}</span>
                            <ArrowRight className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Audit aggregated charts */}
            <TraceAuditPanel
                traces={state.traces}
                total={state.total}
                audit={state.auditQuery.data}
                isLoading={state.auditQuery.isFetching}
                isError={!!state.auditQuery.error}
            />

            {/* Comparison Side By Side Workspace */}
            <TraceComparisonPanel
                traces={state.compareTraces}
                onClear={state.handleClearCompare}
                onRemove={state.handleRemoveCompare}
                onFocus={state.handleFocusTrace}
            />

            {/* Main workspace layout split column list / details */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_400px] flex-1 min-h-[400px]">
                <div className="relative min-h-0 flex flex-col overflow-hidden">
                    {state.tracesQuery.isLoading ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-border bg-card">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : state.traces.length === 0 ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground font-semibold">
                            {t('empty')}
                        </div>
                    ) : (
                        <TraceTable
                            items={state.traces}
                            selectedTraceId={state.effectiveSelectedTraceId}
                            compareTraceIds={state.visibleCompareTraceIds}
                            onSelect={state.setSelectedTraceId}
                            onToggleCompare={state.handleToggleCompare}
                        />
                    )}
                </div>
                <div className="min-h-0">
                    <TraceDetailPanel traceId={state.effectiveSelectedTraceId} />
                </div>
            </div>
        </div>
    );
}
export default Traces;
