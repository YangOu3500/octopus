'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { ArrowDown } from 'lucide-react';
import type { ChannelAttempt } from '@/api/endpoints/log';
import {
    formatDuration,
    formatCost,
    statusBadgeClass,
    protocolPath,
    hasQueueMetadata,
    hasCapacityMetadata,
} from './log-utils';
import { cn } from '@/lib/utils';

// Helper type for merged attempts
interface MergedAttempt extends ChannelAttempt {
    repeat: number;
    lastAttemptNum: number;
    lastAttemptIndex: number;
    totalDuration: number;
}

function sameAttemptGroup(left: ChannelAttempt, right: ChannelAttempt): boolean {
    return (
        left.channel_id === right.channel_id
        && (left.key_id || left.channel_key_id || 0) === (right.key_id || right.channel_key_id || 0)
        && left.model_name === right.model_name
        && (left.upstream_model ?? '') === (right.upstream_model ?? '')
        && left.status === right.status
        && (left.http_status ?? 0) === (right.http_status ?? 0)
        && (left.failure_reason ?? '') === (right.failure_reason ?? '')
        && (left.retryable ?? false) === (right.retryable ?? false)
        && (left.quota_status ?? '') === (right.quota_status ?? '')
        && (left.quota_reason ?? '') === (right.quota_reason ?? '')
        && (left.capacity_status ?? '') === (right.capacity_status ?? '')
        && (left.capacity_reason ?? '') === (right.capacity_reason ?? '')
        && (left.capacity_scope ?? '') === (right.capacity_scope ?? '')
        && (left.capacity_source ?? '') === (right.capacity_source ?? '')
    );
}

function mergeAdjacentAttempts(attempts: ChannelAttempt[]): MergedAttempt[] {
    const out: MergedAttempt[] = [];
    for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        const last = out[out.length - 1];
        if (last && sameAttemptGroup(last, a)) {
            last.repeat += 1;
            last.lastAttemptNum = a.attempt_num;
            last.lastAttemptIndex = a.attempt_index || a.attempt_num;
            last.totalDuration += a.total_ms || a.duration_ms || a.duration;
            continue;
        }
        out.push({
            ...a,
            repeat: 1,
            lastAttemptNum: a.attempt_num,
            lastAttemptIndex: a.attempt_index || a.attempt_num,
            totalDuration: a.total_ms || a.duration_ms || a.duration,
        });
    }
    return out;
}

interface LogAttemptsProps {
    attempts: ChannelAttempt[];
}

export function LogAttempts({ attempts }: LogAttemptsProps) {
    const t = useTranslations('log.card');
    const merged = mergeAdjacentAttempts(attempts);

    if (attempts.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground font-semibold">
                {t('noAttempts') || '暂无尝试记录'}
            </div>
        );
    }

    return (
        <div className="relative pl-3 ml-1.5 space-y-3 border-l border-border/30 text-xs">
            {merged.map((attempt, index) => {
                const isSuccess = attempt.status === 'success';

                return (
                    <div key={`${attempt.channel_id}-${index}`} className="relative">
                        {/* Bullet point on the timeline */}
                        <span className="absolute -left-[18.5px] top-4.5 size-2.5 rounded-full border border-border/50 bg-card flex items-center justify-center z-10 shadow-xs">
                            <span className={cn("size-1.5 rounded-full", isSuccess ? 'bg-emerald-500' : 'bg-destructive')} />
                        </span>

                        <div className="rounded-xl border border-border/40 bg-background/30 p-3 hover:border-primary/10 hover:bg-background/50 transition-all duration-150 flex flex-col gap-2">
                            {/* Header details */}
                            <div className="flex flex-wrap items-start gap-2">
                                <Badge variant="outline" className={cn('h-5 rounded-md px-1.5 text-[9px] font-bold uppercase tracking-wider', statusBadgeClass(attempt.status))}>
                                    {attempt.status || '-'}
                                    {attempt.repeat > 1 ? ` (x${attempt.repeat})` : ''}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-bold text-foreground" title={attempt.channel_name}>
                                        {attempt.channel_name || `渠道 #${attempt.channel_id}`}
                                    </div>
                                    <div className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground/60">
                                        {attempt.model_name} {attempt.upstream_model ? `-> ${attempt.upstream_model}` : ''}
                                    </div>
                                </div>
                                <div className="text-right font-mono tabular-nums text-muted-foreground/90 leading-tight">
                                    <div className="font-bold text-foreground">{formatDuration(attempt.totalDuration)}</div>
                                    {attempt.ttfb_ms ? <div className="text-[9px] mt-0.5">TTFB {formatDuration(attempt.ttfb_ms)}</div> : null}
                                </div>
                            </div>

                            {/* Sub details */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-muted-foreground/80 leading-normal border-t border-border/20 pt-2">
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">HTTP 状态</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">{attempt.http_status || '-'}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">协议</span>
                                    <div className="font-bold text-foreground/90 mt-0.5 truncate" title={protocolPath(attempt)}>{protocolPath(attempt)}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">消耗费用</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">{formatCost(attempt.estimated_cost)}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase">词元 Tokens</span>
                                    <div className="font-bold text-foreground/90 font-mono mt-0.5">
                                        {attempt.input_tokens || 0} / {attempt.output_tokens || 0}
                                    </div>
                                </div>
                            </div>

                            {/* Queue Metadata if present */}
                            {hasQueueMetadata(attempt) && (
                                <div className="rounded bg-muted/30 p-2 text-[10px] border border-border/30 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                                    {attempt.channel_concurrency_mode && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">队列模式:</span>{' '}
                                            <span className="font-bold text-foreground/80">
                                                {attempt.channel_concurrency_mode === 'database' ? '共享队列' : '本地队列'}
                                            </span>
                                        </div>
                                    )}
                                    {attempt.channel_concurrency_limit && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">并发限制:</span>{' '}
                                            <span className="font-bold text-foreground/80 font-mono">{attempt.channel_concurrency_limit}</span>
                                        </div>
                                    )}
                                    {attempt.channel_concurrency_wait_ms && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">等待时间:</span>{' '}
                                            <span className="font-bold text-foreground/80 font-mono">{formatDuration(attempt.channel_concurrency_wait_ms)}</span>
                                        </div>
                                    )}
                                    {(attempt.channel_concurrency_acquired || attempt.channel_concurrency_timed_out) && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">队列结果:</span>{' '}
                                            <span className="font-bold text-foreground/80">
                                                {attempt.channel_concurrency_timed_out ? '排队超时' : '获取成功'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Capacity Metadata if present */}
                            {hasCapacityMetadata(attempt) && (
                                <div className="rounded bg-muted/30 p-2 text-[10px] border border-border/30 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                                    {attempt.quota_status && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">配额状态:</span>{' '}
                                            <span className="font-bold text-foreground/80">{attempt.quota_status}</span>
                                        </div>
                                    )}
                                    {attempt.quota_reason && (
                                        <div className="col-span-1 truncate" title={attempt.quota_reason}>
                                            <span className="font-semibold text-muted-foreground/50">配额原因:</span>{' '}
                                            <span className="font-bold text-foreground/80">{attempt.quota_reason}</span>
                                        </div>
                                    )}
                                    {attempt.capacity_status && (
                                        <div>
                                            <span className="font-semibold text-muted-foreground/50">容量状态:</span>{' '}
                                            <span className="font-bold text-foreground/80">{attempt.capacity_status}</span>
                                        </div>
                                    )}
                                    {attempt.capacity_reason && (
                                        <div className="col-span-1 truncate" title={attempt.capacity_reason}>
                                            <span className="font-semibold text-muted-foreground/50">容量原因:</span>{' '}
                                            <span className="font-bold text-foreground/80">{attempt.capacity_reason}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Error fields */}
                            {(attempt.failure_reason || attempt.error_summary) && (
                                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[10px] text-destructive leading-relaxed font-semibold">
                                    <div className="font-bold">{attempt.failure_reason || '-'}</div>
                                    {attempt.error_summary && (
                                        <div className="mt-1 break-words font-semibold font-mono">{attempt.error_summary}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Node arrow separator */}
                        {index < merged.length - 1 && (
                            <div className="flex justify-center py-1">
                                <ArrowDown className="size-3 text-muted-foreground/20" />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
