'use client';

import { Activity, Gauge, GitBranch, Server, ShieldCheck, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChannelModelHealthRow, type ChannelModelHealthSummary } from '@/api/endpoints/channel';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/utils';

type Translator = ReturnType<typeof useTranslations>;

// Helper formatting utilities
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

function queueModeLabel(t: Translator, mode: string | undefined) {
    switch (mode) {
        case 'database':
            return t('queueMode.database');
        case 'local':
        default:
            return t('queueMode.local');
    }
}

interface StrategyPanelProps {
    summary?: ChannelModelHealthSummary;
    blockedRowsCount: number;
    coolingRowsCount: number;
    worstHealthRow?: ChannelModelHealthRow;
    mostLoadedRow?: ChannelModelHealthRow;
    rangeLabel: string;
}

export function StrategyPanel({
    summary,
    blockedRowsCount,
    coolingRowsCount,
    worstHealthRow,
    mostLoadedRow,
    rangeLabel,
}: StrategyPanelProps) {
    const t = useTranslations('channel.health');
    
    const strategyLabel = summary?.load_balancing_strategy === 'health_score'
        ? t('strategy.healthScore')
        : t('strategy.staticGroupMode');

    return (
        <div className="rounded-xl border border-border bg-card/40 p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <GitBranch className="size-4 text-primary" />
                <span>{t('insights.healthView')}</span>
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-1">
                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('stats.healthScore')}</div>
                    <div className="mt-1 text-xs font-bold text-foreground">{strategyLabel}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                        {summary?.health_score_enabled ? t('healthEnabled') : t('healthDisabled')}
                    </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('channelConcurrency')}</div>
                    <div className="mt-1 text-xs font-bold text-foreground">
                        {summary?.channel_concurrency_enabled 
                            ? queueModeLabel(t, summary.channel_concurrency_mode) 
                            : t('queueMode.disabled')}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{rangeLabel}</div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('insights.blockedRows')}</div>
                    <div className="mt-1 text-xs font-bold text-foreground">{blockedRowsCount}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{t('insights.coolingRows')}: {coolingRowsCount}</div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('insights.worstHealth')}</div>
                    {worstHealthRow ? (
                        <div className="min-w-0">
                            <div className="mt-1 truncate text-xs font-bold text-foreground" title={worstHealthRow.channel_name}>
                                {worstHealthRow.channel_name || `#${worstHealthRow.channel_id}`}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                {worstHealthRow.model_name} · {worstHealthRow.health_score.toFixed(1)}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1 text-xs text-muted-foreground">{t('empty')}</div>
                    )}
                </div>
            </div>

            {mostLoadedRow && (
                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('insights.topLoaded')}</div>
                    <div className="mt-1 truncate text-xs font-bold text-foreground" title={mostLoadedRow.channel_name}>
                        {mostLoadedRow.channel_name || `#${mostLoadedRow.channel_id}`} · {mostLoadedRow.model_name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {t('activeSelections')}: {formatNumber(mostLoadedRow.active_selections)} / {t('requests')}: {formatNumber(mostLoadedRow.request_count)}
                    </div>
                </div>
            )}
        </div>
    );
}

interface HealthSummaryCardsProps {
    summary?: ChannelModelHealthSummary;
    quotaAvailableCount: number;
    quotaUnknownCount: number;
}

export function HealthSummaryCards({
    summary,
    quotaAvailableCount,
    quotaUnknownCount,
}: HealthSummaryCardsProps) {
    const t = useTranslations('channel.health');

    const totalLoad = (summary?.active_selections ?? 0) + (summary?.channel_concurrency_active ?? 0);

    const cards = [
        {
            id: 'rows',
            icon: Server,
            label: t('stats.rows'),
            value: formatNumber(summary?.request_rows),
            sub: t('stats.rowsSub', { requests: summary?.total_requests ?? 0 }),
        },
        {
            id: 'success',
            icon: ShieldCheck,
            label: t('stats.successRate'),
            value: formatPercent(summary?.avg_success_rate, (summary?.success_count ?? 0) + (summary?.failure_count ?? 0) > 0),
            sub: t('stats.successSub', { success: summary?.success_count ?? 0, failed: summary?.failure_count ?? 0 }),
        },
        {
            id: 'health',
            icon: Gauge,
            label: t('stats.healthScore'),
            value: (summary?.health_score_enabled && (summary?.health_sample_count ?? 0) > 0)
                ? formatDecimal(summary?.avg_health_score, 1)
                : t('noHealthSampleOrDisabled'),
            sub: t(`strategy.${summary?.load_balancing_strategy === 'health_score' ? 'healthScore' : 'staticGroupMode'}`),
        },
        {
            id: 'load',
            icon: Activity,
            label: t('stats.load'),
            value: formatNumber(totalLoad),
            sub: summary?.channel_concurrency_enabled
                ? t('stats.loadSubWithConcurrency', {
                    cooldown: summary?.cooling_down_count ?? 0,
                    active: summary?.channel_concurrency_active ?? 0,
                    limit: summary?.channel_concurrency_max ?? 0,
                    mode: queueModeLabel(t, summary?.channel_concurrency_mode),
                })
                : t('stats.loadSub', { cooldown: summary?.cooling_down_count ?? 0 }),
        },
        {
            id: 'capacity',
            icon: Wallet,
            label: t('stats.capacity'),
            value: formatNumber(summary?.capacity_blocked_count ?? 0),
            sub: t('stats.capacitySub', {
                available: quotaAvailableCount,
                unknown: quotaUnknownCount,
            }),
        },
    ];

    return (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((item) => {
                const Icon = item.icon;
                const isWarningValue = item.id === 'health' && typeof item.value === 'string' && item.value.length > 5;
                return (
                    <div key={item.id} className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <Icon className="size-3.5" />
                                <span>{item.label}</span>
                            </div>
                            <div className={cn(
                                "mt-2 font-bold tabular-nums tracking-tight text-foreground",
                                isWarningValue ? "text-xs font-semibold text-muted-foreground/80 leading-normal" : "text-xl"
                            )}>
                                {item.value}
                            </div>
                        </div>
                        <div className="mt-2.5 truncate text-[10px] font-semibold text-muted-foreground/80" title={item.sub}>
                            {item.sub}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
