'use client';

import { useMemo, useState } from 'react';
import { Activity, Clock3, Download, Gauge, GitBranch, Loader2, ShieldAlert, Thermometer, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useGroupRoutingPreview, type GroupRoutingCandidate } from '@/api/endpoints/group-routing';
import { MODE_LABELS } from './group-utils';
import { cn } from '@/lib/utils';
import {
    CandidateRow,
    formatMS,
    decisionLabel,
    decisionTone,
    queueModeLabel,
    routingNoteLabel
} from './group-routing-row';

const GROUP_ROUTING_EXPORT_VERSION = 3;

function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

function sanitizeRoutingCandidateForExport(candidate: GroupRoutingCandidate) {
    return compactObject({
        group_item_id: candidate.group_item_id,
        rank: candidate.rank,
        channel_id: candidate.channel_id,
        channel_name: candidate.channel_name,
        channel_key_id: candidate.channel_key_id,
        site_id: candidate.site_id,
        site_name: candidate.site_name,
        site_account_id: candidate.site_account_id,
        site_account_name: candidate.site_account_name,
        model_name: candidate.model_name,
        priority: candidate.priority,
        weight: candidate.weight,
        enabled: candidate.enabled,
        health_score: candidate.health_score,
        sample_count: candidate.sample_count,
        success_count: candidate.success_count,
        failure_count: candidate.failure_count,
        success_rate: candidate.success_rate,
        empty_response_rate: candidate.empty_response_rate,
        rate_limit_count: candidate.rate_limit_count,
        avg_ttfb_ms: candidate.avg_ttfb_ms,
        avg_total_ms: candidate.avg_total_ms,
        active_selections: candidate.active_selections,
        channel_concurrency_active: candidate.channel_concurrency_active,
        channel_concurrency_limit: candidate.channel_concurrency_limit,
        channel_concurrency_mode: candidate.channel_concurrency_mode,
        cooling_down: candidate.cooling_down,
        cooldown_remaining_ms: candidate.cooldown_remaining_ms,
        cooldown_reason: candidate.cooldown_reason,
        quota_status: candidate.quota_status,
        quota_reason: candidate.quota_reason,
        quota_balance: candidate.quota_balance,
        quota_used: candidate.quota_used,
        capacity_status: candidate.capacity_status,
        capacity_reason: candidate.capacity_reason,
        capacity_scope: candidate.capacity_scope,
        capacity_source: candidate.capacity_source,
        last_observed_at: candidate.last_observed_at,
        expires_at: candidate.expires_at,
        effective_score: candidate.effective_score,
        decision: candidate.decision,
        notes: candidate.notes,
    });
}

export function GroupRoutingBadge({ groupId }: { groupId?: number }) {
    const t = useTranslations('group.routing');
    const [open, setOpen] = useState(false);
    const { data, isLoading, error } = useGroupRoutingPreview(groupId, open);

    const summary = useMemo(() => {
        const candidates = data?.candidates ?? [];
        const ready = candidates.filter((item) => item.decision === 'ready').length;
        const cooling = candidates.filter((item) => item.cooling_down).length;
        const activeSelections = candidates.reduce((sum, item) => sum + item.active_selections, 0);
        const channelConcurrencyActive = candidates.reduce((sum, item) => sum + item.channel_concurrency_active, 0);
        const blocked = candidates.length - ready;
        const avgScore = candidates.length
            ? candidates.reduce((sum, item) => sum + item.health_score, 0) / candidates.length
            : 100;
        const avgEffective = candidates.length
            ? candidates.reduce((sum, item) => sum + item.effective_score, 0) / candidates.length
            : 0;
        const latencySamples = candidates.filter((item) => item.avg_total_ms > 0);
        const avgLatency = latencySamples.length
            ? latencySamples.reduce((sum, item) => sum + item.avg_total_ms, 0) / latencySamples.length
            : 0;
        const quotaBlocked = candidates.filter((item) => item.quota_status !== 'available' && item.quota_status !== 'unknown').length;
        const capacityBlocked = candidates.filter((item) => item.capacity_status === 'blocked').length;
        const blockedReasons = Array.from(
            candidates
                .filter((item) => item.decision !== 'ready')
                .reduce((map, item) => {
                    map.set(item.decision, (map.get(item.decision) || 0) + 1);
                    return map;
                }, new Map<string, number>())
                .entries(),
        ).sort((left, right) => right[1] - left[1]).slice(0, 3);

        return {
            total: candidates.length,
            ready,
            cooling,
            activeSelections,
            channelConcurrencyActive,
            blocked,
            avgScore,
            avgEffective,
            avgLatency,
            quotaBlocked,
            capacityBlocked,
            blockedReasons,
            preferred: candidates[0],
        };
    }, [data]);

    const exportRoutingPreview = () => {
        if (!data || data.candidates.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        try {
            downloadJson(`octopus-group-routing-${data.group_name || 'group'}-${new Date().getTime()}.json`, {
                export_version: GROUP_ROUTING_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                group: {
                    group_id: data.group_id,
                    group_name: data.group_name,
                    group_mode: data.group_mode,
                    group_mode_label: t(`mode.${MODE_LABELS[data.group_mode]}`),
                    health_score_enabled: data.health_score_enabled,
                    channel_concurrency_enabled: data.channel_concurrency_enabled,
                    channel_concurrency_mode: data.channel_concurrency_mode,
                    channel_concurrency_max: data.channel_concurrency_max,
                    channel_concurrency_lease_ttl_ms: data.channel_concurrency_lease_ttl_ms,
                },
                summary,
                candidates: data.candidates.map(sanitizeRoutingCandidateForExport),
            });
            toast.success(t('export.success'));
        } catch (err) {
            toast.error(t('export.failed'), { description: err instanceof Error ? err.message : String(err) });
        }
    };

    if (!groupId) return null;

    const modeLabel = data ? t(`mode.${MODE_LABELS[data.group_mode]}`) : '';
    const preferredNotes = (summary.preferred?.notes ?? []).map((note) => routingNoteLabel(t, note)).filter(Boolean).slice(0, 3);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="mb-3 h-8 w-full justify-start rounded-xl text-xs font-semibold">
                    <GitBranch className="size-3.5 mr-1" />
                    {t('trigger')}
                </Button>
            </DialogTrigger>

            <DialogContent className="flex h-[min(85vh,42rem)] flex-col overflow-hidden rounded-2xl sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Gauge className="size-5 text-primary" />
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground animate-pulse">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        {t('loading')}
                    </div>
                ) : error ? (
                    <div className="flex flex-1 items-center justify-center text-xs text-destructive">
                        <ShieldAlert className="mr-2 size-4" />
                        {t('loadFailed')}
                    </div>
                ) : (
                    <>
                        <div className="grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <GitBranch className="size-3.5" />
                                    {t('modeLabel')}
                                </div>
                                <div className="mt-1 font-medium">{modeLabel}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <Thermometer className="size-3.5" />
                                    {t('healthSwitch')}
                                </div>
                                <div className={cn('mt-1 font-medium', data?.health_score_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                                    {data?.health_score_enabled ? t('enabled') : t('disabled')}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <Activity className="size-3.5" />
                                    {t('ready')}
                                </div>
                                <div className="mt-1 font-medium">{summary.ready}/{summary.total}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <Activity className="size-3.5" />
                                    {t('currentLoad')}
                                </div>
                                <div className="mt-1 font-medium">
                                    {summary.activeSelections + summary.channelConcurrencyActive}
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                    {data?.channel_concurrency_enabled
                                        ? `${queueModeLabel(t, data.channel_concurrency_mode)} ${summary.channelConcurrencyActive}/${data.channel_concurrency_max || 0}`
                                        : t('queueMode.disabled')}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <ShieldAlert className="size-3.5" />
                                    {t('blocked')}
                                </div>
                                <div className="mt-1 font-medium">{summary.blocked}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <Clock3 className="size-3.5" />
                                    {t('cooling')}
                                </div>
                                <div className="mt-1 font-medium">{summary.cooling} / {summary.avgScore.toFixed(1)}</div>
                            </div>
                        </div>

                        <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr] text-xs">
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                <div className="text-[10px] text-muted-foreground">{t('insights.topCandidate')}</div>
                                {summary.preferred ? (
                                    <div className="mt-2 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium" title={summary.preferred.channel_name}>
                                                    {summary.preferred.channel_name || `#${summary.preferred.channel_id}`}
                                                </div>
                                                <div className="truncate text-xs text-muted-foreground" title={summary.preferred.model_name}>
                                                    {summary.preferred.model_name}
                                                </div>
                                            </div>
                                            <Badge variant="outline" className={cn('rounded-md text-[11px]', decisionTone(summary.preferred.decision))}>
                                                {decisionLabel(t, summary.preferred.decision)}
                                            </Badge>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-3">
                                            <div className="rounded-lg bg-background px-3 py-2">
                                                <div className="text-[10px] text-muted-foreground">{t('effectiveScore')}</div>
                                                <div className="mt-1 text-sm font-medium">{summary.preferred.effective_score.toFixed(1)}</div>
                                            </div>
                                            <div className="rounded-lg bg-background px-3 py-2">
                                                <div className="text-[10px] text-muted-foreground">{t('latency')}</div>
                                                <div className="mt-1 text-sm font-medium">{formatMS(summary.preferred.avg_total_ms)}</div>
                                            </div>
                                            <div className="rounded-lg bg-background px-3 py-2">
                                                <div className="text-[10px] text-muted-foreground">{t('activeSelections')}</div>
                                                <div className="mt-1 text-sm font-medium">{summary.preferred.active_selections || 0}</div>
                                            </div>
                                        </div>
                                        {preferredNotes.length ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {preferredNotes.map((note, index) => (
                                                    <span
                                                        key={`${summary.preferred?.group_item_id}-${index}`}
                                                        className="rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                                                    >
                                                        {note}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="mt-2 text-sm text-muted-foreground">{t('empty')}</div>
                                )}
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                <div className="text-[10px] text-muted-foreground">{t('insights.topBlocked')}</div>
                                {summary.blockedReasons.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {summary.blockedReasons.map(([reason, count]) => (
                                            <div key={reason} className="rounded-lg bg-background px-3 py-2">
                                                <div className="text-xs font-medium">{decisionLabel(t, reason)}</div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">{count} / {summary.blocked}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-2 text-sm text-muted-foreground">{t('insights.allReady')}</div>
                                )}
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                <div className="text-[10px] text-muted-foreground">{t('insights.healthView')}</div>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.readyShare')}</div>
                                        <div className="mt-1 text-sm font-medium">{summary.ready}/{summary.total || 0}</div>
                                    </div>
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.avgHealth')}</div>
                                        <div className="mt-1 text-sm font-medium">{summary.avgScore.toFixed(1)}</div>
                                    </div>
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.avgEffective')}</div>
                                        <div className="mt-1 text-sm font-medium">{summary.avgEffective.toFixed(1)}</div>
                                    </div>
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.avgLatency')}</div>
                                        <div className="mt-1 text-sm font-medium">{formatMS(summary.avgLatency)}</div>
                                    </div>
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.quotaBlocked')}</div>
                                        <div className="mt-1 text-sm font-medium">{summary.quotaBlocked}</div>
                                    </div>
                                    <div className="rounded-lg bg-background px-3 py-2">
                                        <div className="text-[10px] text-muted-foreground">{t('insights.capacityBlocked')}</div>
                                        <div className="mt-1 text-sm font-medium">{summary.capacityBlocked}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="text-xs text-muted-foreground">
                                {t('export.hint')}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg"
                                onClick={exportRoutingPreview}
                                disabled={!data?.candidates.length}
                            >
                                <Download className="size-4 mr-1" />
                                {t('export.button')}
                            </Button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border text-xs">
                            <table className="w-full min-w-[76rem] text-left">
                                <thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground backdrop-blur">
                                    <tr className="border-b border-border">
                                        <th className="px-3 py-2">{t('table.rank')}</th>
                                        <th className="px-3 py-2">{t('table.candidate')}</th>
                                        <th className="px-3 py-2">{t('table.manual')}</th>
                                        <th className="px-3 py-2">{t('table.health')}</th>
                                        <th className="px-3 py-2">{t('table.load')}</th>
                                        <th className="px-3 py-2">{t('table.latency')}</th>
                                        <th className="px-3 py-2">{t('table.failures')}</th>
                                        <th className="px-3 py-2">
                                            <div className="flex items-center gap-1">
                                                <Wallet className="size-3.5" />
                                                {t('table.quota')}
                                            </div>
                                        </th>
                                        <th className="px-3 py-2">{t('table.decision')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.candidates ?? []).length ? data?.candidates.map((candidate) => (
                                        <CandidateRow key={`${candidate.group_item_id}-${candidate.channel_id}-${candidate.model_name}`} candidate={candidate} />
                                    )) : (
                                        <tr>
                                            <td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">
                                                {t('empty')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
