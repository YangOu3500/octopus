'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { type GroupRoutingCandidate } from '@/api/endpoints/group-routing';
import { cn } from '@/lib/utils';

type Translator = ReturnType<typeof useTranslations>;

export function formatPercent(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return `${(value * 100).toFixed(0)}%`;
}

export function formatMS(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

export function formatCooldown(value: number | undefined) {
    if (!value || value <= 0) return '-';
    const seconds = Math.ceil(value / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
}

export function formatQuota(value: number | undefined) {
    if (typeof value !== 'number') return '-';
    return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(4);
}

export function formatUnixTime(value: number | undefined) {
    if (!value || value <= 0) return '-';
    return new Date(value * 1000).toLocaleString();
}

export function codeToWords(value: string | undefined) {
    return (value || '').trim().replace(/[_-]+/g, ' ');
}

export function parsePrefixedCount(input: string | undefined, prefix: string) {
    if (!input) return undefined;
    const normalized = input.trim().toLowerCase();
    if (!normalized.startsWith(prefix)) return undefined;
    const count = Number.parseInt(normalized.slice(prefix.length).trim(), 10);
    return Number.isFinite(count) ? count : undefined;
}

export function scoreTone(score: number) {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
}

export function quotaTone(status: string) {
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

export function decisionTone(decision: string) {
    switch (decision) {
        case 'ready':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'health_cooldown':
        case 'circuit_breaker':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        default:
            return 'border-destructive/20 bg-destructive/10 text-destructive';
    }
}

export function decisionLabel(t: Translator, decision: string) {
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

export function quotaLabel(t: Translator, status: string) {
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

export function capacityLabel(t: Translator, status: string | undefined) {
    switch (status) {
        case 'available':
            return t('capacity.available');
        case 'blocked':
            return t('capacity.blocked');
        default:
            return t('capacity.unknown');
    }
}

export function queueModeLabel(t: Translator, mode: string | undefined) {
    switch (mode) {
        case 'database':
            return t('queueMode.database');
        case 'local':
        default:
            return t('queueMode.local');
    }
}

export function reasonLabel(t: Translator, reason: string | undefined) {
    const normalized = (reason || '').trim().toLowerCase();
    if (!normalized) return '';

    switch (normalized) {
        case 'quota_error':
            return t('quota.quotaError');
        case 'auth_error':
            return t('quota.authError');
        case 'rate_limit':
        case 'rate_limited':
        case 'too_many_requests':
            return t('quota.rateLimited');
        case 'http_402':
            return 'HTTP 402';
        case 'http_auth':
            return 'HTTP 401/403';
        case 'site_account_balance':
            return t('reasons.siteAccountBalance');
        default: {
            const mappedDecision = decisionLabel(t, normalized);
            if (mappedDecision !== normalized) return mappedDecision;
            return codeToWords(reason);
        }
    }
}

export function routingNoteLabel(t: Translator, note: string | undefined) {
    const normalized = (note || '').trim().toLowerCase();
    if (!normalized) return '';

    const activeSelections = parsePrefixedCount(normalized, 'active selections:');
    if (activeSelections !== undefined) {
        return t('notes.activeSelections', { count: activeSelections });
    }

    const skippedCoolingKeys = parsePrefixedCount(normalized, 'skipped cooling keys:');
    if (skippedCoolingKeys !== undefined) {
        return t('notes.skippedCoolingKeys', { count: skippedCoolingKeys });
    }

    const skippedBlockedKeys = parsePrefixedCount(normalized, 'skipped blocked keys:');
    if (skippedBlockedKeys !== undefined) {
        return t('notes.skippedBlockedKeys', { count: skippedBlockedKeys });
    }

    switch (normalized) {
        case 'channel not found':
            return t('notes.channelNotFound');
        case 'channel disabled':
            return t('notes.channelDisabled');
        case 'no available key':
            return t('notes.noAvailableKey');
        case 'health cooldown active':
            return t('notes.healthCooldownActive');
        case 'managed runtime check failed':
            return t('notes.runtimeCheckFailed');
        default:
            return reasonLabel(t, normalized) || codeToWords(note);
    }
}

export function CandidateRow({ candidate }: { candidate: GroupRoutingCandidate }) {
    const t = useTranslations('group.routing');
    const notes = (candidate.notes ?? []).map((note) => routingNoteLabel(t, note)).filter(Boolean);
    const detailChips = [
        candidate.quota_reason ? `${t('quota.reason')}: ${reasonLabel(t, candidate.quota_reason)}` : '',
        candidate.capacity_reason ? `${t('capacity.reason')}: ${reasonLabel(t, candidate.capacity_reason)}` : '',
    ].filter(Boolean);

    return (
        <tr
            className={cn(
                'border-b border-border/60 align-top last:border-0',
                candidate.rank === 1 && candidate.decision === 'ready' ? 'bg-emerald-500/[0.04]' : '',
            )}
        >
            <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">#{candidate.rank}</td>
            <td className="max-w-[14rem] px-3 py-3">
                <div className="truncate text-sm font-medium" title={candidate.channel_name}>
                    {candidate.channel_name || `#${candidate.channel_id}`}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground" title={candidate.model_name}>
                    {candidate.model_name}
                </div>
                {candidate.site_account_name || candidate.site_name ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground" title={candidate.site_account_name || candidate.site_name || ''}>
                        {candidate.site_account_name || candidate.site_name}
                    </div>
                ) : null}
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
                {candidate.channel_concurrency_limit ? (
                    <div className="text-muted-foreground">
                        {t('channelConcurrency')}: {candidate.channel_concurrency_active || 0} / {candidate.channel_concurrency_limit}
                    </div>
                ) : null}
                {candidate.channel_concurrency_mode ? (
                    <div className="text-muted-foreground">{queueModeLabel(t, candidate.channel_concurrency_mode)}</div>
                ) : null}
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
                        {t('quota.reason')}: {reasonLabel(t, candidate.quota_reason)}
                    </div>
                ) : null}
                <div className="mt-0.5 truncate text-muted-foreground" title={`${candidate.capacity_source || '-'} / ${candidate.capacity_scope || '-'}`}>
                    {t('capacity.label')}: {capacityLabel(t, candidate.capacity_status)}
                </div>
                {candidate.capacity_source || candidate.capacity_scope ? (
                    <div className="truncate text-muted-foreground" title={`${candidate.capacity_source || '-'} / ${candidate.capacity_scope || '-'}`}>
                        {candidate.capacity_source || '-'} / {candidate.capacity_scope || '-'}
                    </div>
                ) : null}
                {candidate.expires_at ? (
                    <div className="truncate text-muted-foreground" title={formatUnixTime(candidate.expires_at)}>
                        {t('capacity.expires')}: {formatUnixTime(candidate.expires_at)}
                    </div>
                ) : null}
                {candidate.last_observed_at ? (
                    <div className="truncate text-muted-foreground" title={formatUnixTime(candidate.last_observed_at)}>
                        {t('capacity.observed')}: {formatUnixTime(candidate.last_observed_at)}
                    </div>
                ) : null}
            </td>
            <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={cn('rounded-md text-[11px]', decisionTone(candidate.decision))}>
                        {decisionLabel(t, candidate.decision)}
                    </Badge>
                    {candidate.capacity_status === 'blocked' ? (
                        <Badge variant="outline" className="rounded-md border-amber-500/20 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
                            {capacityLabel(t, candidate.capacity_status)}
                        </Badge>
                    ) : null}
                </div>
                {candidate.cooling_down ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                        {reasonLabel(t, candidate.cooldown_reason) || t('cooldown')} / {formatCooldown(candidate.cooldown_remaining_ms)}
                    </div>
                ) : null}
                {detailChips.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {detailChips.map((item) => (
                            <span key={item} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                {item}
                            </span>
                        ))}
                    </div>
                ) : null}
                {notes.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {notes.map((note, index) => (
                            <span
                                key={`${candidate.group_item_id}-${index}`}
                                className="rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                            >
                                {note}
                            </span>
                        ))}
                    </div>
                ) : null}
            </td>
        </tr>
    );
}
