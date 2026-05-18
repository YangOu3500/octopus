'use client';

import { useMemo, useState } from 'react';
import { Activity, Clock3, Download, Gauge, GitBranch, LoaderCircle, ShieldAlert, Thermometer, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/common/Toast';
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

const GROUP_ROUTING_EXPORT_VERSION = 1;

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

function formatQuota(value: number | undefined) {
    if (typeof value !== 'number') return '-';
    return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(4);
}

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
}

function safeFilenamePart(value: string | undefined) {
    const normalized = (value || 'group').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
    return normalized.slice(0, 80) || 'group';
}

function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

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
        cooling_down: candidate.cooling_down,
        cooldown_remaining_ms: candidate.cooldown_remaining_ms,
        cooldown_reason: candidate.cooldown_reason,
        quota_status: candidate.quota_status,
        quota_reason: candidate.quota_reason,
        quota_balance: candidate.quota_balance,
        quota_used: candidate.quota_used,
        effective_score: candidate.effective_score,
        decision: candidate.decision,
        notes: candidate.notes,
    });
}

function scoreTone(score: number) {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
}

function quotaTone(status: string) {
    switch (status) {
        case 'available':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'rate_limited':
        case 'zero_balance':
        case 'no_key':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'quota_error':
        case 'auth_error':
        case 'site_disabled':
        case 'account_disabled':
        case 'account_missing':
        case 'model_disabled':
            return 'border-destructive/20 bg-destructive/10 text-destructive';
        default:
            return 'border-muted-foreground/20 bg-muted text-muted-foreground';
    }
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
        case 'managed_runtime_check_failed':
            return t('decision.runtimeCheckFailed');
        case 'site_missing':
            return t('decision.siteMissing');
        case 'site_disabled':
            return t('decision.siteDisabled');
        case 'site_account_missing':
            return t('decision.accountMissing');
        case 'site_account_disabled':
            return t('decision.accountDisabled');
        case 'site_account_zero_balance':
            return t('decision.zeroBalance');
        case 'site_model_disabled':
            return t('decision.modelDisabled');
        default:
            return decision;
    }
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
                <div>{t('activeSelections')}: {candidate.active_selections || '-'}</div>
                <div className="text-muted-foreground">{t('effectiveScore')}: {candidate.effective_score.toFixed(1)}</div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div>{t('latency')}: {formatMS(candidate.avg_total_ms)}</div>
                <div className="text-muted-foreground">{t('ttfb')}: {formatMS(candidate.avg_ttfb_ms)}</div>
            </td>
            <td className="px-3 py-3 text-xs tabular-nums">
                <div>{t('emptyRate')}: {formatPercent(candidate.empty_response_rate)}</div>
                <div className="text-muted-foreground">429: {candidate.rate_limit_count || '-'}</div>
            </td>
            <td className="px-3 py-3 text-xs">
                <Badge variant="outline" className={cn('rounded-md text-[11px]', quotaTone(candidate.quota_status))}>
                    {quotaLabel(t, candidate.quota_status)}
                </Badge>
                <div className="mt-1 truncate text-muted-foreground" title={candidate.site_account_name || candidate.site_name || ''}>
                    {candidate.site_account_name || candidate.site_name || '-'}
                </div>
                <div className="text-muted-foreground">
                    {t('quota.balance')}: {formatQuota(candidate.quota_balance)}
                    {candidate.quota_used !== undefined ? ` / ${formatQuota(candidate.quota_used)}` : ''}
                </div>
                {candidate.quota_reason ? (
                    <div className="mt-0.5 truncate text-muted-foreground" title={candidate.quota_reason}>
                        {t('quota.reason')}: {candidate.quota_reason}
                    </div>
                ) : null}
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
        const activeSelections = candidates.reduce((sum, item) => sum + item.active_selections, 0);
        const blocked = candidates.length - ready;
        const avgScore = candidates.length
            ? candidates.reduce((sum, item) => sum + item.health_score, 0) / candidates.length
            : 100;
        return { total: candidates.length, ready, cooling, activeSelections, blocked, avgScore };
    }, [data]);

    const exportRoutingPreview = () => {
        if (!data || data.candidates.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        try {
            const exportedAt = exportTimestamp();
            const modeText = t(`mode.${MODE_LABELS[data.group_mode]}`);
            downloadJson(`octopus-group-routing-${safeFilenamePart(data.group_name)}-${exportFilenameTimestamp()}.json`, {
                export_version: GROUP_ROUTING_EXPORT_VERSION,
                exported_at: exportedAt,
                group: {
                    group_id: data.group_id,
                    group_name: data.group_name,
                    group_mode: data.group_mode,
                    group_mode_label: modeText,
                    health_score_enabled: data.health_score_enabled,
                },
                summary,
                candidates: data.candidates.map(sanitizeRoutingCandidateForExport),
            });
            toast.success(t('export.success'), { description: t('export.safe') });
        } catch (err) {
            toast.error(t('export.failed'), { description: err instanceof Error ? err.message : String(err) });
        }
    };

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
                        <div className="grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
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
                                    <Activity className="size-3.5" />
                                    {t('currentLoad')}
                                </div>
                                <div className="mt-1 font-medium">{summary.activeSelections}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <ShieldAlert className="size-3.5" />
                                    {t('blocked')}
                                </div>
                                <div className="mt-1 font-medium">{summary.blocked}</div>
                            </div>
                            <div className="rounded-lg border bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock3 className="size-3.5" />
                                    {t('cooling')}
                                </div>
                                <div className="mt-1 font-medium">{summary.cooling} · {summary.avgScore.toFixed(1)}</div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
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
                                <Download className="size-4" />
                                {t('export.button')}
                            </Button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
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
