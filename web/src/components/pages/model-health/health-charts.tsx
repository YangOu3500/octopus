'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { type ChannelModelHealthRow, type ChannelModelHealthSummary } from '@/api/endpoints/channel';

function rowStatus(row: ChannelModelHealthRow): 'cooldown' | 'failed' | 'active' | 'idle' {
    if (row.cooling_down) return 'cooldown';
    if (row.failure_count > 0 && row.success_count === 0) return 'failed';
    if (row.request_count > 0) return 'active';
    return 'idle';
}

function codeToWords(value: string | undefined) {
    return (value || '').trim().replace(/[_-]+/g, ' ');
}

type Translator = ReturnType<typeof useTranslations>;

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

interface HealthChartsProps {
    rows: ChannelModelHealthRow[];
    summary?: ChannelModelHealthSummary;
    blockedRows: ChannelModelHealthRow[];
    topBlockedReasons: [string, number][];
    rangeLabel: string;
    worstHealthRow?: ChannelModelHealthRow;
}

export function HealthCharts({
    rows,
    summary,
    blockedRows,
    topBlockedReasons,
    rangeLabel,
    worstHealthRow,
}: HealthChartsProps) {
    const t = useTranslations('channel.health');

    const statusChartData = useMemo(() => ([
        { label: t('status.active'), count: rows.filter((row) => rowStatus(row) === 'active').length },
        { label: t('status.cooldown'), count: rows.filter((row) => rowStatus(row) === 'cooldown').length },
        { label: t('status.failed'), count: rows.filter((row) => rowStatus(row) === 'failed').length },
        { label: t('status.idle'), count: rows.filter((row) => rowStatus(row) === 'idle').length },
    ]), [rows, t]);

    const healthBucketData = useMemo(() => {
        const buckets = [
            { label: '80-100', count: 0 },
            { label: '60-79', count: 0 },
            { label: '40-59', count: 0 },
            { label: '0-39', count: 0 },
        ];
        rows.filter((row) => row.health_sample_count > 0).forEach((row) => {
            if (row.health_score >= 80) buckets[0].count += 1;
            else if (row.health_score >= 60) buckets[1].count += 1;
            else if (row.health_score >= 40) buckets[2].count += 1;
            else buckets[3].count += 1;
        });
        return buckets;
    }, [rows]);

    const riskyRowsChartData = useMemo(() => (
        [...rows]
            .filter((row) => row.health_sample_count > 0)
            .sort((left, right) => left.health_score - right.health_score || right.failure_count - left.failure_count)
            .slice(0, 6)
            .map((row) => ({
                label: `${row.channel_name || `#${row.channel_id}`}`.slice(0, 14),
                score: Number(row.health_score.toFixed(1)),
            }))
    ), [rows]);

    const blockedReasonChartData = useMemo(() => (
        topBlockedReasons.map(([reason, count]) => ({
            label: (reasonLabel(t, reason) || t('quota.unknown')).slice(0, 16),
            count,
        }))
    ), [t, topBlockedReasons]);

    const statusChartConfig = useMemo(() => ({ count: { label: t('stats.rows') } }), [t]);
    const healthChartConfig = useMemo(() => ({ count: { label: t('stats.healthScore') } }), [t]);
    const riskChartConfig = useMemo(() => ({ score: { label: t('stats.healthScore') } }), [t]);

    const hasHealthBuckets = healthBucketData.some((item) => item.count > 0);
    const hasRiskyRows = riskyRowsChartData.length > 0;
    const hasBlockedReasons = blockedReasonChartData.length > 0;
    const hasStatusData = statusChartData.some((item) => item.count > 0);

    return (
        <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-3">
                {/* Health Buckets Chart */}
                <div className="rounded-xl border border-border bg-card/40 p-4 lg:col-span-2">
                    <div className="min-w-0 mb-3">
                        <div className="truncate text-xs font-bold text-foreground">{t('stats.healthScore')}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{t('insights.healthView')}</div>
                    </div>
                    {hasHealthBuckets ? (
                        <ChartContainer config={healthChartConfig} className="h-40 w-full">
                            <BarChart data={healthBucketData}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} className="text-[10px]" />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="var(--chart-3)" />
                            </BarChart>
                        </ChartContainer>
                    ) : (
                        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground font-semibold">
                            {t('empty')}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    {/* Worst Health Score Chart */}
                    <div className="rounded-xl border border-border bg-card/40 p-4">
                        <div className="min-w-0 mb-3">
                            <div className="truncate text-xs font-bold text-foreground">{t('insights.worstHealth')}</div>
                            {worstHealthRow && (
                                <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={worstHealthRow.channel_name}>
                                    {worstHealthRow.channel_name || `#${worstHealthRow.channel_id}`} / {worstHealthRow.model_name}
                                </div>
                            )}
                        </div>
                        {hasRiskyRows ? (
                            <ChartContainer config={riskChartConfig} className="h-40 w-full">
                                <BarChart data={riskyRowsChartData}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} className="text-[10px]" />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <Bar dataKey="score" radius={[4, 4, 0, 0]} fill="var(--chart-2)" />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground font-semibold">
                                {t('noSamples')}
                            </div>
                        )}
                    </div>

                    {/* Blocked Reasons Chart */}
                    <div className="rounded-xl border border-border bg-card/40 p-4">
                        <div className="min-w-0 mb-3">
                            <div className="truncate text-xs font-bold text-foreground">{t('insights.topBlocked')}</div>
                            {blockedRows.length > 0 && (
                                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                    {blockedRows.length} / {summary?.total_rows ?? 0}
                                </div>
                            )}
                        </div>
                        {hasBlockedReasons ? (
                            <ChartContainer config={statusChartConfig} className="h-40 w-full">
                                <BarChart data={blockedReasonChartData}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} className="text-[10px]" />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="var(--chart-5)" />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground font-semibold">
                                {t('insights.allHealthy')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Requests Status Bar Chart */}
                <div className="rounded-xl border border-border bg-card/40 p-4 lg:col-span-2">
                    <div className="min-w-0 mb-3">
                        <div className="truncate text-xs font-bold text-foreground">{t('stats.rows')}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{rangeLabel}</div>
                    </div>
                    {hasStatusData ? (
                        <ChartContainer config={statusChartConfig} className="h-40 w-full">
                            <BarChart data={statusChartData}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} className="text-[10px]" />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="var(--chart-1)" />
                            </BarChart>
                        </ChartContainer>
                    ) : (
                        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground font-semibold">
                            {t('empty')}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Top Blocked Reasons Text Panel */}
                    <div className="rounded-xl border border-border bg-card/40 p-4">
                        <div className="text-xs font-bold text-foreground mb-3">{t('insights.topBlocked')}</div>
                        {topBlockedReasons.length ? (
                            <div className="flex flex-col gap-2">
                                {topBlockedReasons.map(([reason, count]) => (
                                    <div key={reason} className="rounded-lg border border-border bg-background px-3 py-2">
                                        <div className="text-xs font-bold text-foreground truncate">{reasonLabel(t, reason) || t('quota.unknown')}</div>
                                        <div className="mt-0.5 text-[10px] text-muted-foreground">{count} / {blockedRows.length}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground font-semibold">{t('insights.allHealthy')}</div>
                        )}
                    </div>

                    {/* Status Pie Chart */}
                    <div className="rounded-xl border border-border bg-card/40 p-4 flex flex-col justify-between">
                        <div>
                            <div className="text-xs font-bold text-foreground">{t('insights.healthView')}</div>
                        </div>
                        {hasStatusData ? (
                            <div className="h-28 w-full mt-2">
                                <ChartContainer config={statusChartConfig} className="h-full w-full">
                                    <PieChart>
                                        <Pie
                                            data={statusChartData.filter((d) => d.count > 0)}
                                            dataKey="count"
                                            nameKey="label"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={20}
                                            outerRadius={35}
                                            paddingAngle={2}
                                        >
                                            {statusChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={`var(--chart-${(index % 5) + 1})`} />
                                            ))}
                                        </Pie>
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                    </PieChart>
                                </ChartContainer>
                            </div>
                        ) : (
                            <div className="flex h-28 items-center justify-center text-xs text-muted-foreground font-semibold">
                                {t('empty')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
