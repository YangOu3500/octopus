'use client';

import { useMemo, useState } from 'react';
import { Activity, Clock3, Gauge, GitBranch, LoaderCircle, ShieldAlert, Thermometer } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { MODE_LABELS } from './utils';
import { cn } from '@/lib/utils';

function formatPercent(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return `${(value * 100).toFixed(0)}%`;
}

function formatMS(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function formatCooldown(value: number | undefined) {
    if (!value || value <= 0) return '-';
    const seconds = Math.ceil(value / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
}

function scoreTone(score: number) {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
}

function decisionTone(decision: string) {
    switch (decision) {
        case 'ready':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'health_cooldown':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        default:
            return 'border-destructive/20 bg-destructive/10 text-destructive';
    }
}

type Translator = ReturnType<typeof useTranslations>;

function decisionLabel(t: Translator, decision: string) {
    switch (decision) {
        case 'ready':
            return t('decision.ready');
        case 'health_cooldown':
            return t('decision.healthCooldown');
        case 'channel_disabled':
            return t('decision.channelDisabled');
        case 'no_available_key':
            return t('decision.noKey');
        case 'channel_missing':
            return t('decision.channelMissing');
        case 'circuit_breaker':
            return t('decision.circuitBreaker');
        default:
            return decision;
    }
}

function CandidateRow({ candidate }: { candidate: GroupRoutingCandidate }) {
    const t = useTranslations('group.routing');
    return (
        <tr className="border-b border-border/60 align-top last:border-0">
            <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">#{candidate.rank}</td>
            <td className="max-w-[14rem] px-3 py-3">
                <div className="truncate text-sm font-medium" title={candidate.channel_name}>
                    {candidate.channel_name || `#${candidate.channel_id}`}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground" title={candidate.model_name}>
                    {candidate.model_name}
                </div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div>{t('priority')}: {candidate.priority || '-'}</div>
                <div className="text-muted-foreground">{t('weight')}: {candidate.weight || 1}</div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div className={cn('text-sm font-semibold', scoreTone(candidate.health_score))}>
                    {candidate.health_score.toFixed(1)}
                </div>
                <div className="text-muted-foreground">
                    {candidate.sample_count ? t('sampleMeta', {
                        success: candidate.success_count,
                        total: candidate.sample_count,
                        rate: formatPercent(candidate.success_rate),
                    }) : t('noSamples')}
                </div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div>{t('latency')}: {formatMS(candidate.avg_total_ms)}</div>
                <div className="text-muted-foreground">{t('ttfb')}: {formatMS(candidate.avg_ttfb_ms)}</div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div>{t('emptyRate')}: {formatPercent(candidate.empty_response_rate)}</div>
                <div className="text-muted-foreground">429: {candidate.rate_limit_count || '-'}</div>
            </td>
            <td className="px-3 py-3">
                <Badge variant="outline" className={cn('rounded-md text-[11px]', decisionTone(candidate.decision))}>
                    {decisionLabel(t, candidate.decision)}
                </Badge>
                {candidate.cooling_down ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                        {candidate.cooldown_reason || t('cooldown')} · {formatCooldown(candidate.cooldown_remaining_ms)}
                    </div>
                ) : null}
            </td>
        </tr>
    );
}

export function GroupRoutingBadge({ groupId }: { groupId?: number }) {
    const t = useTranslations('group.routing');
    const [open, setOpen] = useState(false);
    const { data, isLoading, error } = useGroupRoutingPreview(groupId, open);

    const summary = useMemo(() => {
        const candidates = data?.candidates ?? [];
        const ready = candidates.filter((item) => item.decision === 'ready').length;
        const cooling = candidates.filter((item) => item.cooling_down).length;
        const avgScore = candidates.length
            ? candidates.reduce((sum, item) => sum + item.health_score, 0) / candidates.length
            : 100;
        return { total: candidates.length, ready, cooling, avgScore };
    }, [data]);

    if (!groupId) return null;

    const modeLabel = data ? t(`mode.${MODE_LABELS[data.group_mode]}`) : '';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="mb-3 h-8 w-full justify-start rounded-xl text-xs">
                    <GitBranch className="size-3.5" />
                    {t('trigger')}
                </Button>
            </DialogTrigger>

            <DialogContent className="flex h-[min(85vh,42rem)] flex-col overflow-hidden rounded-3xl sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Gauge className="size-5 text-primary" />
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        {t('loading')}
                    </div>
                ) : error ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-destructive">
                        <ShieldAlert className="mr-2 size-4" />
                        {t('loadFailed')}
                    </div>
                ) : (
                    <>
                        <div className="grid gap-2 text-sm md:grid-cols-4">
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <GitBranch className="size-3.5" />
                                    {t('modeLabel')}
                                </div>
                                <div className="mt-1 font-medium">{modeLabel}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Thermometer className="size-3.5" />
                                    {t('healthSwitch')}
                                </div>
                                <div className={cn('mt-1 font-medium', data?.health_score_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                                    {data?.health_score_enabled ? t('enabled') : t('disabled')}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Activity className="size-3.5" />
                                    {t('ready')}
                                </div>
                                <div className="mt-1 font-medium">{summary.ready}/{summary.total}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock3 className="size-3.5" />
                                    {t('cooling')}
                                </div>
                                <div className="mt-1 font-medium">{summary.cooling} · {summary.avgScore.toFixed(1)}</div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
                            <table className="w-full min-w-[62rem] text-left">
                                <thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground backdrop-blur">
                                    <tr className="border-b border-border">
                                        <th className="px-3 py-2">{t('table.rank')}</th>
                                        <th className="px-3 py-2">{t('table.candidate')}</th>
                                        <th className="px-3 py-2">{t('table.manual')}</th>
                                        <th className="px-3 py-2">{t('table.health')}</th>
                                        <th className="px-3 py-2">{t('table.latency')}</th>
                                        <th className="px-3 py-2">{t('table.failures')}</th>
                                        <th className="px-3 py-2">{t('table.decision')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.candidates ?? []).length ? data?.candidates.map((candidate) => (
                                        <CandidateRow key={`${candidate.group_item_id}-${candidate.channel_id}-${candidate.model_name}`} candidate={candidate} />
                                    )) : (
                                        <tr>
                                            <td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">
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
