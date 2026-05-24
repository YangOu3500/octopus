'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type ChannelModelHealthRow } from '@/api/endpoints/channel';
import { formatCount, formatMoney } from '@/lib/utils';

// Row grid layout definition to match headers exactly
const HEALTH_ROW_GRID_COLUMNS = 'minmax(12rem, 1.25fr) minmax(9rem, 0.9fr) minmax(9rem, 0.9fr) minmax(8rem, 0.8fr) minmax(9rem, 0.9fr) minmax(11rem, 1.1fr)';

type Translator = ReturnType<typeof useTranslations>;

// Format helpers matching the original design
function codeToWords(value: string | undefined) {
    return (value || '').trim().replace(/[_-]+/g, ' ');
}

function formatNumber(value: number | undefined): string {
    if (value === undefined || value <= 0) return '-';
    const res = formatCount(value).formatted;
    return `${res.value}${res.unit}`;
}

function formatPercent(value: number | undefined, hasSamples = true) {
    if (!hasSamples || value === undefined) return '-';
    return `${(value * 100).toFixed(0)}%`;
}

function formatDecimal(value: number | undefined, digits = 1) {
    if (value === undefined || value <= 0) return '-';
    return value.toFixed(digits);
}

function formatMS(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function formatCost(value: number | undefined): string {
    if (value === undefined || value <= 0) return '-';
    const res = formatMoney(value).formatted;
    return `${res.value}${res.unit}`;
}

function formatCooldown(value: number | undefined) {
    if (value === undefined || value <= 0) return '-';
    const seconds = Math.ceil(value / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.ceil(minutes / 60)}h`;
}

function healthTone(score: number) {
    if (score >= 80) return 'text-emerald-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-destructive';
}

function quotaTone(status: string) {
    switch (status) {
        case 'available':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500';
        case 'rate_limited':
        case 'zero_balance':
        case 'no_key':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-500';
        case 'quota_error':
        case 'auth_error':
        case 'site_disabled':
        case 'account_disabled':
        case 'account_missing':
        case 'model_disabled':
            return 'border-destructive/20 bg-destructive/10 text-destructive';
        default:
            return 'border-border bg-background text-muted-foreground';
    }
}

function rowStatusTone(row: ChannelModelHealthRow) {
    if (row.cooling_down) return 'border-amber-500/20 bg-amber-500/10 text-amber-500';
    if (row.failure_count > 0 && row.success_count === 0) return 'border-destructive/20 bg-destructive/10 text-destructive';
    if (row.request_count > 0) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500';
    return 'border-border bg-background text-muted-foreground';
}

function rowStatus(row: ChannelModelHealthRow): 'cooldown' | 'failed' | 'active' | 'idle' {
    if (row.cooling_down) return 'cooldown';
    if (row.failure_count > 0 && row.success_count === 0) return 'failed';
    if (row.request_count > 0) return 'active';
    return 'idle';
}

function quotaLabel(t: Translator, status: string) {
    switch (status) {
        case 'available':
            return t('quota.available');
        case 'zero_balance':
            return t('quota.zeroBalance');
        case 'account_disabled':
            return t('quota.accountDisabled');
        case 'quota_error':
            return t('quota.quotaError');
        case 'auth_error':
            return t('quota.authError');
        case 'rate_limited':
            return t('quota.rateLimited');
        case 'no_key':
            return t('quota.noKey');
        case 'site_disabled':
            return t('quota.siteDisabled');
        case 'account_missing':
            return t('quota.accountMissing');
        case 'model_disabled':
            return t('quota.modelDisabled');
        default:
            return t('quota.unknown');
    }
}

function capacityLabel(t: Translator, status: string | undefined) {
    switch (status) {
        case 'available':
            return t('capacity.available');
        case 'blocked':
            return t('capacity.blocked');
        default:
            return t('capacity.unknown');
    }
}

function queueModeLabel(t: Translator, mode: string | undefined) {
    switch (mode) {
        case 'database':
            return t('queueMode.database');
        case 'local':
        default:
            return t('queueMode.local');
    }
}

function reasonLabel(t: Translator, reason: string | undefined) {
    const normalized = (reason || '').trim().toLowerCase();
    if (!normalized) return '';

    switch (normalized) {
        case 'quota_error':
            return t('reasons.quotaError');
        case 'auth_error':
            return t('reasons.authError');
        case 'rate_limit':
        case 'rate_limited':
        case 'too_many_requests':
            return t('reasons.rateLimited');
        case 'http_402':
            return t('reasons.http402');
        case 'http_auth':
            return t('reasons.httpAuth');
        case 'site_account_balance':
            return t('reasons.siteAccountBalance');
        case 'site_account_zero_balance':
            return t('reasons.zeroBalance');
        case 'site_disabled':
        case 'site_missing':
            return t('reasons.siteDisabled');
        case 'site_account_missing':
        case 'account_missing':
            return t('reasons.accountMissing');
        case 'site_account_disabled':
        case 'account_disabled':
            return t('reasons.accountDisabled');
        case 'site_model_disabled':
        case 'model_disabled':
            return t('reasons.modelDisabled');
        case 'no_available_key':
        case 'no_key':
            return t('reasons.noAvailableKey');
        case 'health_cooldown':
            return t('reasons.healthCooldown');
        case 'circuit_breaker':
            return t('reasons.circuitBreaker');
        case 'managed_runtime_check_failed':
            return t('reasons.runtimeCheckFailed');
        case 'channel_disabled':
            return t('reasons.channelDisabled');
        case 'channel_missing':
            return t('reasons.channelMissing');
        default:
            return codeToWords(reason);
    }
}

interface HealthTableProps {
    rows: ChannelModelHealthRow[];
    isLoading: boolean;
    error: Error | null;
    totalRowsCount: number;
}

export function HealthTable({
    rows,
    isLoading,
    error,
    totalRowsCount,
}: HealthTableProps) {
    const t = useTranslations('channel.health');
    const containerRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => containerRef.current,
        getItemKey: (index) => {
            const row = rows[index];
            return row ? `${row.channel_id}-${row.model_name}` : `health-row-${index}`;
        },
        estimateSize: () => 110,
        measureElement: (element) =>
            element instanceof HTMLElement ? element.offsetHeight : element.getBoundingClientRect().height,
        overscan: 10,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    if (isLoading) {
        return (
            <div className="flex h-60 items-center justify-center text-xs text-muted-foreground animate-pulse font-semibold">
                {t('loading')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-60 items-center justify-center text-xs text-destructive font-semibold gap-2">
                <AlertTriangle className="size-4" />
                {t('loadFailed')}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex-1 overflow-auto overscroll-contain border border-border bg-card rounded-xl text-xs">
            <div className="min-w-[62rem] text-left">
                {/* Header Row */}
                <div
                    className="sticky top-0 z-10 grid border-b border-border bg-muted/80 text-[10px] uppercase font-bold tracking-wider text-muted-foreground backdrop-blur-md"
                    style={{ gridTemplateColumns: HEALTH_ROW_GRID_COLUMNS }}
                >
                    <div className="px-4 py-3">{t('table.channel')}</div>
                    <div className="px-4 py-3">{t('table.health')}</div>
                    <div className="px-4 py-3">{t('table.calls')}</div>
                    <div className="px-4 py-3">{t('table.latency')}</div>
                    <div className="px-4 py-3">{t('table.load')}</div>
                    <div className="px-4 py-3 flex items-center gap-1">
                        <Wallet className="size-3.5" />
                        <span>{t('table.quota')}</span>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="px-4 py-16 text-center text-muted-foreground font-semibold text-xs bg-background/20">
                        {totalRowsCount === 0 ? t('noCallRecords') : t('empty')}
                    </div>
                ) : (
                    <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                        {virtualRows.map((virtualRow) => {
                            const row = rows[virtualRow.index];
                            if (!row) return null;

                            const status = rowStatus(row);
                            const lastFailure = row.last_failure_reason ? (reasonLabel(t, row.last_failure_reason) || row.last_failure_reason) : '';

                            return (
                                <div
                                    key={virtualRow.key}
                                    data-index={virtualRow.index}
                                    ref={rowVirtualizer.measureElement}
                                    className={cn(
                                        'absolute left-0 top-0 grid w-full border-b border-border/40 transition-colors hover:bg-muted/10',
                                        row.capacity_status === 'blocked'
                                            ? 'bg-destructive/[0.02]'
                                            : row.cooling_down
                                                ? 'bg-amber-500/[0.03]'
                                                : row.request_count > 0
                                                    ? 'bg-emerald-500/[0.02]'
                                                    : ''
                                    )}
                                    style={{
                                        gridTemplateColumns: HEALTH_ROW_GRID_COLUMNS,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    {/* Channel & Model */}
                                    <div className="px-4 py-3 min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-bold text-foreground truncate" title={row.channel_name}>
                                                {row.channel_name || `#${row.channel_id}`}
                                            </span>
                                            {row.managed && (
                                                <Badge variant="secondary" className="h-4.5 rounded-md px-1 text-[9px] font-bold">
                                                    {t('managed')}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="mt-1 truncate text-muted-foreground/90 font-medium" title={row.model_name}>
                                            {row.model_name}
                                        </div>
                                        {(row.site_account_name || row.site_name) && (
                                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60 font-semibold" title={row.site_account_name || row.site_name}>
                                                {row.site_account_name || row.site_name}
                                            </div>
                                        )}
                                    </div>

                                    {/* Health Score */}
                                    <div className="px-4 py-3 flex flex-col justify-center tabular-nums">
                                        {row.health_sample_count > 0 ? (
                                            <>
                                                <div className={cn('text-sm font-bold', healthTone(row.health_score))}>
                                                    {row.health_score.toFixed(1)}
                                                </div>
                                                <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full',
                                                            row.health_score >= 80
                                                                ? 'bg-emerald-500'
                                                                : row.health_score >= 50
                                                                    ? 'bg-amber-500'
                                                                    : 'bg-destructive'
                                                        )}
                                                        style={{ width: `${Math.max(6, Math.min(100, row.health_score))}%` }}
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-xs font-semibold text-muted-foreground/60">
                                                {t('unrated')}
                                            </div>
                                        )}
                                        <div className="mt-1.5 text-[10px] text-muted-foreground/80 leading-normal">
                                            {row.health_sample_count ? t('healthSamples', {
                                                success: row.health_success_count,
                                                total: row.health_sample_count,
                                                rate: formatPercent(row.health_success_rate),
                                            }) : t('noSamples')}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/60 leading-normal font-semibold">
                                            {t('emptyRate')}: {formatPercent(row.empty_response_rate, row.health_sample_count > 0)}
                                            {row.rate_limit_count > 0 && ` / 429: ${row.rate_limit_count}`}
                                        </div>
                                    </div>

                                    {/* Calls Status & Meta */}
                                    <div className="px-4 py-3 flex flex-col justify-center tabular-nums">
                                        <div>
                                            <Badge variant="outline" className={cn('rounded-md px-1 py-0 text-[9px] font-bold uppercase tracking-wider', rowStatusTone(row))}>
                                                {t(`status.${status}`)}
                                            </Badge>
                                        </div>
                                        <div className="mt-1.5 text-[10px] text-muted-foreground/90 font-medium">
                                            {t('callMeta', {
                                                success: row.success_count,
                                                failed: row.failure_count,
                                                rate: formatPercent(row.success_rate, row.request_count > 0),
                                            })}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/60 font-semibold mt-0.5">
                                            Tok/s: {formatDecimal(row.tokens_per_second, 1)} / RPM: {formatDecimal(row.rpm, 1)}
                                        </div>
                                    </div>

                                    {/* Latency & Metrics */}
                                    <div className="px-4 py-3 flex flex-col justify-center tabular-nums font-medium text-muted-foreground/95">
                                        <div>TTFB: {formatMS(row.avg_ttfb_ms)}</div>
                                        <div className="text-[10px] text-muted-foreground/60 font-semibold">{t('duration')}: {formatMS(row.avg_total_ms)}</div>
                                        <div className="mt-1 text-[10px] text-muted-foreground/60 leading-normal font-semibold">
                                            In/Out: {formatNumber(row.input_tokens)} / {formatNumber(row.output_tokens)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/60 leading-normal font-semibold">
                                            Cache: {formatNumber(row.cache_tokens)}
                                        </div>
                                        <div className="mt-0.5 text-foreground/90 font-bold">{formatCost(row.estimated_cost)}</div>
                                    </div>

                                    {/* Active Load & Cooldown */}
                                    <div className="px-4 py-3 flex flex-col justify-center tabular-nums">
                                        <div className="font-semibold text-foreground/80">
                                            {t('activeSelections')}: {formatNumber(row.active_selections)}
                                        </div>
                                        {row.channel_concurrency_limit ? (
                                            <div className="text-[10px] text-muted-foreground/60 font-semibold leading-normal">
                                                {t('channelConcurrency')}: {row.channel_concurrency_active} / {row.channel_concurrency_limit}
                                            </div>
                                        ) : null}
                                        {row.channel_concurrency_mode && (
                                            <div className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-wider">
                                                {queueModeLabel(t, row.channel_concurrency_mode)}
                                            </div>
                                        )}
                                        {row.cooling_down ? (
                                            <div className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                                {reasonLabel(t, row.cooldown_reason) || t('cooldown')} ({formatCooldown(row.cooldown_remaining_ms)})
                                            </div>
                                        ) : (
                                            <div className="mt-1 text-[10px] text-muted-foreground/40 font-semibold">{t('noCooldown')}</div>
                                        )}
                                    </div>

                                    {/* Quota & Capacity */}
                                    <div className="px-4 py-3 flex flex-col justify-center min-w-0">
                                        <div className="flex">
                                            <Badge variant="outline" className={cn('rounded-md px-1.5 py-0 text-[9px] font-bold flex items-center gap-1 shrink-0', quotaTone(row.quota_status))}>
                                                <Wallet className="size-2.5" />
                                                {quotaLabel(t, row.quota_status)}
                                            </Badge>
                                        </div>
                                        {row.quota_balance !== undefined && (
                                            <div className="mt-1 tabular-nums text-[10px] text-muted-foreground/80 font-bold">
                                                Bal: {formatDecimal(row.quota_balance, 2)} / Used: {formatDecimal(row.quota_used, 2)}
                                            </div>
                                        )}
                                        {row.quota_reason && (
                                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60 font-semibold" title={row.quota_reason}>
                                                {t('quota.reason')}: {reasonLabel(t, row.quota_reason)}
                                            </div>
                                        )}
                                        {row.capacity_status && (
                                            <div className="mt-0.5 text-[10px] text-muted-foreground/60 font-semibold">
                                                {t('capacity.label')}: {capacityLabel(t, row.capacity_status)}
                                                {row.capacity_reason && ` (${reasonLabel(t, row.capacity_reason)})`}
                                            </div>
                                        )}
                                        {lastFailure && (
                                            <div className="mt-1 line-clamp-2 text-[10px] font-semibold text-destructive/80 leading-snug" title={row.last_failure_reason}>
                                                {lastFailure}
                                            </div>
                                        )}
                                        {row.last_http_status && (
                                            <div className="text-[10px] text-muted-foreground/50 tabular-nums">
                                                HTTP {row.last_http_status}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
