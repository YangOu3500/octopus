'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, Clock3, LoaderCircle, Play, Trash2, FileSearch, FlaskConical, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ModelTestResult } from '@/api/endpoints/model-test';

export interface TestRow {
    key: string;
    channelId: number;
    channelName: string;
    modelName: string;
    protocol: string;
    enabled: boolean;
}

interface TestResultsProps {
    rows: TestRow[];
    selectedKeys: Set<string>;
    onToggleRow: (key: string) => void;
    onToggleAll: () => void;
    allVisibleSelected: boolean;
    results: Record<string, ModelTestResult>;
    runStateByKey: Map<string, 'running' | 'queued'>;
    onRunRows: (rows: TestRow[], concurrency?: number) => void;
    onClearRow: (key: string) => void;
    onOpenLog: (result: ModelTestResult) => void;
    onOpenDetail: (result: ModelTestResult) => void;
    isPending: boolean;
    mode: 'channel' | 'model';
}

const MODEL_TEST_GRID_COLUMNS = '2.5rem minmax(11.5rem,1.18fr) minmax(8.25rem,0.82fr) minmax(7.75rem,0.76fr) minmax(8.75rem,0.84fr) minmax(10.25rem,1fr) 5rem';

function protocolLabel(protocol: string): string {
    switch (protocol) {
        case 'openai_response':
            return 'Responses';
        case 'anthropic':
            return 'Anthropic';
        case 'gemini':
            return 'Gemini';
        case 'volcengine':
            return 'Volcengine';
        case 'openai_embedding':
            return 'Embedding';
        case 'openai_chat':
        default:
            return 'Chat';
    }
}

function formatMS(value?: number) {
    if (!value || value <= 0) return '-';
    if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
    return `${Math.round(value)}ms`;
}

function formatCount(value?: number) {
    if (!value || value <= 0) return '-';
    return new Intl.NumberFormat().format(value);
}

function formatSpeed(value?: number) {
    if (!value || value <= 0) return '-';
    return value.toFixed(1);
}

function formatCost(value?: number) {
    if (value === undefined || value <= 0) return '-';
    return `$${value.toFixed(6)}`;
}

export function TestResults({
    rows,
    selectedKeys,
    onToggleRow,
    onToggleAll,
    allVisibleSelected,
    results,
    runStateByKey,
    onRunRows,
    onClearRow,
    onOpenLog,
    onOpenDetail,
    isPending,
    mode,
}: TestResultsProps) {
    const t = useTranslations('modelTest');
    const parentRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 92,
        overscan: 10,
    });

    return (
        <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-border bg-card shadow-xs flex flex-col">
            <div ref={parentRef} className="flex-1 overflow-auto overscroll-contain text-xs">
                <div className="min-w-[48rem] text-left">
                    {/* Sticky Table Header */}
                    <div
                        className="sticky top-0 z-10 grid border-b border-border bg-muted/90 text-left text-[10px] uppercase font-bold tracking-wider text-muted-foreground backdrop-blur-md"
                        style={{ gridTemplateColumns: MODEL_TEST_GRID_COLUMNS }}
                    >
                        <div className="px-3 py-3.5 flex items-center justify-center">
                            <button
                                type="button"
                                onClick={onToggleAll}
                                className={cn(
                                    'flex size-4.5 items-center justify-center rounded border border-border transition-all duration-150',
                                    allVisibleSelected && 'border-primary bg-primary text-primary-foreground'
                                )}
                            >
                                {allVisibleSelected && <Circle className="size-2.5 fill-current" />}
                            </button>
                        </div>
                        <div className="px-3 py-3.5 flex items-center">{mode === 'channel' ? t('table.model') : t('table.channel')}</div>
                        <div className="px-3 py-3.5 flex items-center">{t('table.status')}</div>
                        <div className="px-3 py-3.5 flex items-center">{`${t('table.http')} / ${t('table.duration')}`}</div>
                        <div className="px-3 py-3.5 flex items-center">{`${t('table.tokens')} / ${t('table.cost')}`}</div>
                        <div className="px-3 py-3.5 flex items-center">{t('table.response')}</div>
                        <div className="px-3 py-3.5 flex items-center justify-end pr-5">{t('table.actions')}</div>
                    </div>

                    {/* Virtual List or Empty State */}
                    {rows.length === 0 ? (
                        <div className="px-4 py-20 text-center text-muted-foreground font-semibold flex flex-col items-center justify-center gap-2">
                            <FlaskConical className="size-8 text-muted-foreground/60 animate-pulse" />
                            <span>{t('emptyRows')}</span>
                        </div>
                    ) : (
                        <div
                            className="relative w-full"
                            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const row = rows[virtualRow.index];
                                if (!row) return null;

                                const runStatus = runStateByKey.get(row.key);
                                const isRunning = Boolean(runStatus);
                                const result = results[row.key];
                                
                                let status: 'running' | 'queued' | 'success' | 'failed' | 'idle' = 'idle';
                                if (runStatus) status = runStatus;
                                else if (result) status = result.success ? 'success' : 'failed';

                                const isSelected = selectedKeys.has(row.key);

                                return (
                                    <div
                                        key={virtualRow.key}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        className={cn(
                                            'absolute left-0 top-0 grid w-full border-b border-border/40 transition-colors hover:bg-muted/10 align-top last:border-0',
                                            isRunning ? 'bg-amber-500/[0.02]' : isSelected ? 'bg-muted/5' : ''
                                        )}
                                        style={{
                                            gridTemplateColumns: MODEL_TEST_GRID_COLUMNS,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        {/* Checkbox */}
                                        <div className="px-3 py-3 flex items-start justify-center mt-1">
                                            <button
                                                type="button"
                                                onClick={() => row.enabled && onToggleRow(row.key)}
                                                disabled={!row.enabled}
                                                className={cn(
                                                    'flex size-4.5 items-center justify-center rounded border border-border transition-all duration-150',
                                                    isSelected && 'border-primary bg-primary text-primary-foreground',
                                                    !row.enabled && 'cursor-not-allowed opacity-40'
                                                )}
                                            >
                                                {isSelected && <Circle className="size-2.5 fill-current" />}
                                            </button>
                                        </div>

                                        {/* Target Info */}
                                        <div className="min-w-0 px-3 py-3 flex flex-col justify-start">
                                            <div className="truncate font-bold text-foreground" title={mode === 'channel' ? row.modelName : row.channelName}>
                                                {mode === 'channel' ? row.modelName : row.channelName}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80 font-medium">
                                                <span className="truncate max-w-[100px]" title={mode === 'channel' ? row.channelName : row.modelName}>
                                                    {mode === 'channel' ? row.channelName : row.modelName}
                                                </span>
                                                <Badge variant="outline" className="rounded-md px-1.5 py-0.5 text-[9px] font-bold">
                                                    {protocolLabel(row.protocol)}
                                                </Badge>
                                                {!row.enabled && (
                                                    <Badge variant="outline" className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-destructive border-destructive/35 bg-destructive/[0.04]">
                                                        {t('status.disabled')}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status */}
                                        <div className="px-3 py-3 flex flex-col items-start justify-start">
                                            {status === 'running' ? (
                                                <Badge variant="outline" className="rounded-md gap-1 px-1.5 py-0.5 text-[9.5px] font-bold border-amber-500/30 text-amber-500 bg-amber-500/[0.04]">
                                                    <LoaderCircle className="size-3 animate-spin" />
                                                    {t('status.running')}
                                                </Badge>
                                            ) : status === 'queued' ? (
                                                <Badge variant="secondary" className="rounded-md gap-1 px-1.5 py-0.5 text-[9.5px] font-bold">
                                                    <Clock3 className="size-3" />
                                                    {t('status.queued')}
                                                </Badge>
                                            ) : status === 'success' ? (
                                                <Badge className="rounded-md gap-1 px-1.5 py-0.5 text-[9.5px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                                                    <CheckCircle2 className="size-3" />
                                                    {t('status.success')}
                                                </Badge>
                                            ) : status === 'failed' ? (
                                                <Badge variant="destructive" className="rounded-md gap-1 px-1.5 py-0.5 text-[9.5px] font-bold">
                                                    <XCircle className="size-3" />
                                                    {t('status.failed')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="rounded-md px-1.5 py-0.5 text-[9.5px] font-bold text-muted-foreground/80">
                                                    {row.enabled ? t('status.idle') : t('status.disabled')}
                                                </Badge>
                                            )}
                                            {result?.failure_reason ? (
                                                <div className="mt-1 line-clamp-1 text-[11px] font-bold text-destructive font-mono" title={result.failure_reason}>
                                                    {result.failure_reason}
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* HTTP & Duration */}
                                        <div className="px-3 py-3 text-[11px] tabular-nums text-muted-foreground/85 flex flex-col justify-start">
                                            <div className="font-semibold text-foreground">{t('table.http')}: {result?.http_status || '-'}</div>
                                            <div className="mt-0.5">{t('table.ttfb')}: {formatMS(result?.ttfb_ms)}</div>
                                            <div>{t('table.duration')}: {formatMS(result?.duration_ms)}</div>
                                        </div>

                                        {/* Tokens & Cost */}
                                        <div className="px-3 py-3 text-[11px] tabular-nums text-muted-foreground/85 flex flex-col justify-start">
                                            <div className="font-semibold text-foreground">
                                                {formatCount(result?.input_tokens)} / {formatCount(result?.output_tokens)}
                                            </div>
                                            <div className="mt-0.5">{t('cache')}: {formatCount(result?.cache_tokens)}</div>
                                            <div>{t('table.speed')}: {formatSpeed(result?.tokens_per_second)}</div>
                                            <div>{t('table.cost')}: {formatCost(result?.estimated_cost)}</div>
                                        </div>

                                        {/* Response Preview */}
                                        <div className="px-3 py-3 min-w-0 flex items-start mt-0.5">
                                            <div
                                                onClick={() => result && onOpenDetail(result)}
                                                className={cn(
                                                    'font-mono text-[11.5px] rounded-lg p-2.5 border border-border/10 tracking-wide whitespace-pre-wrap break-words h-14 w-full overflow-y-auto leading-normal cursor-pointer select-none transition-all duration-150',
                                                    status === 'success' ? 'bg-black/85 text-emerald-400 border-emerald-500/20 hover:bg-black/90' :
                                                    status === 'failed' ? 'bg-black/85 text-red-400 border-red-500/20 hover:bg-black/90' :
                                                    isRunning ? 'bg-black/75 text-amber-300 border-amber-500/30 shadow-2xs hover:bg-black/80' :
                                                    'bg-black/45 text-muted-foreground border-border/5 hover:bg-black/60'
                                                )}
                                                title={result?.response_text || result?.error_message || ''}
                                            >
                                                {runStatus === 'queued' ? `[SYSTEM]: ${t('queued')}...` : isRunning ? `[STREAMS]: ${t('running')}...` : result?.response_text || result?.error_message || '[CONSOLE]: IDLE'}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-start justify-end gap-1.5 px-3 py-3 pr-5">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                title={t('runOne')}
                                                aria-label={t('runOne')}
                                                disabled={isPending || !row.enabled}
                                                onClick={() => onRunRows([row], 1)}
                                            >
                                                <Play className="size-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                title={t('clearOne')}
                                                aria-label={t('clearOne')}
                                                disabled={!result}
                                                onClick={() => onClearRow(row.key)}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                            {result?.log_id || result?.trace_id ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                    title={t('viewLog')}
                                                    aria-label={t('viewLog')}
                                                    onClick={() => onOpenLog(result)}
                                                >
                                                    <FileSearch className="size-3.5" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
