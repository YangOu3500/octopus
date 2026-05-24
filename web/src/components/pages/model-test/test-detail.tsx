'use client';

import { useTranslations } from 'next-intl';
import { Terminal, Clock, Coins, XCircle, FileText, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ModelTestResult } from '@/api/endpoints/model-test';

interface TestDetailProps {
    result: ModelTestResult | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onViewLog?: (result: ModelTestResult) => void;
}

function formatMS(value?: number) {
    if (!value || value <= 0) return '-';
    if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
    return `${Math.round(value)}ms`;
}

function formatCost(value?: number) {
    if (value === undefined || value <= 0) return '-';
    return `$${value.toFixed(6)}`;
}

export function TestDetail({ result, open, onOpenChange, onViewLog }: TestDetailProps) {
    const t = useTranslations('modelTest');

    if (!result) return null;

    const isSuccess = result.success;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-card border border-border rounded-xl p-5 shadow-lg text-xs">
                <DialogHeader className="border-b border-border pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <DialogTitle className="text-sm font-bold tracking-tight text-foreground truncate max-w-[80%]">
                            {result.model_name}
                        </DialogTitle>
                        <Badge
                            className={`rounded-md ${
                                isSuccess ? 'bg-emerald-600 text-white' : 'bg-destructive text-destructive-foreground'
                            }`}
                        >
                            {isSuccess ? t('status.success') : t('status.failed')}
                        </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 font-medium truncate mt-1">
                        {t('channel')}: {result.channel_name} ({result.protocol})
                    </div>
                </DialogHeader>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 my-1.5">
                    <div className="border border-border/60 bg-muted/15 rounded-lg p-2.5 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 uppercase flex items-center gap-1.5">
                            <Clock className="size-3.5 text-muted-foreground" />
                            {t('table.duration')}
                        </span>
                        <div className="font-semibold text-foreground text-sm font-mono mt-0.5">
                            {formatMS(result.duration_ms)}
                        </div>
                        {result.ttfb_ms ? (
                            <span className="text-[10px] text-muted-foreground/75 font-mono">
                                {t('table.ttfb')}: {formatMS(result.ttfb_ms)}
                            </span>
                        ) : null}
                    </div>

                    <div className="border border-border/60 bg-muted/15 rounded-lg p-2.5 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 uppercase flex items-center gap-1.5">
                            <Terminal className="size-3.5 text-muted-foreground" />
                            {t('table.tokens')}
                        </span>
                        <div className="font-semibold text-foreground text-sm font-mono mt-0.5">
                            {result.input_tokens ?? 0} / {result.output_tokens ?? 0}
                        </div>
                        {result.tokens_per_second ? (
                            <span className="text-[10px] text-muted-foreground/75 font-mono">
                                Speed: {result.tokens_per_second.toFixed(1)} Tok/s
                            </span>
                        ) : null}
                    </div>

                    <div className="border border-border/60 bg-muted/15 rounded-lg p-2.5 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 uppercase flex items-center gap-1.5">
                            <Coins className="size-3.5 text-muted-foreground" />
                            {t('table.cost')}
                        </span>
                        <div className="font-semibold text-foreground text-sm font-mono mt-0.5">
                            {formatCost(result.estimated_cost)}
                        </div>
                        {result.cache_tokens ? (
                            <span className="text-[10px] text-muted-foreground/75 font-mono">
                                Cache: {result.cache_tokens}
                            </span>
                        ) : null}
                    </div>

                    <div className="border border-border/60 bg-muted/15 rounded-lg p-2.5 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 uppercase flex items-center gap-1.5">
                            <FileText className="size-3.5 text-muted-foreground" />
                            HTTP Status
                        </span>
                        <div className="font-semibold text-foreground text-sm font-mono mt-0.5">
                            {result.http_status || '-'}
                        </div>
                        {result.channel_key_id ? (
                            <span className="text-[10px] text-muted-foreground/75 font-mono">
                                Key ID: {result.channel_key_id}
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* Console Output */}
                <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                        {isSuccess ? t('table.response') : 'Error Log / Message'}
                    </span>
                    <div
                        className={`font-mono text-[11px] rounded-lg p-3 border whitespace-pre-wrap break-words max-h-60 overflow-y-auto leading-relaxed shadow-inner ${
                            isSuccess
                                ? 'bg-black/85 text-emerald-400 border-emerald-500/20'
                                : 'bg-black/85 text-red-400 border-red-500/20'
                        }`}
                    >
                        {isSuccess ? result.response_text : result.error_message || result.failure_reason || 'Unknown error'}
                    </div>
                </div>

                {/* Failure Details (if failed) */}
                {!isSuccess && result.failure_reason ? (
                    <div className="border border-destructive/20 bg-destructive/5 rounded-lg p-3 mt-3 flex items-start gap-2.5">
                        <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-destructive">Failure Code: {result.failure_reason}</span>
                            {result.error_message && (
                                <span className="text-muted-foreground/90 font-mono text-[10.5px] mt-1 line-clamp-3">
                                    {result.error_message}
                                </span>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* Action Buttons */}
                {(result.log_id || result.trace_id) && onViewLog ? (
                    <div className="border-t border-border mt-4 pt-3 flex justify-end">
                        <Button
                            type="button"
                            size="sm"
                            className="rounded-lg text-xs font-semibold gap-1.5 h-8 px-3"
                            onClick={() => onViewLog(result)}
                        >
                            <span>{t('viewLog')}</span>
                            <ArrowRight className="size-3.5" />
                        </Button>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
