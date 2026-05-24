'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
    Waypoints,
    CalendarCheck2,
    Pencil,
    Trash2,
    MoreHorizontal,
    RefreshCw
} from 'lucide-react';
import {
    type Site as SiteRecord,
    type SiteAccount,
} from '@/api/endpoints/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSettingStore } from '@/stores/setting';
import {
    accountHasHealthFailure,
    accountHasCheckinEnabled,
    deriveCheckinStatus
} from './checkin-status';
import { translateSiteMessage } from './site-message';

export function formatBalance(value: number) {
    if (value === 0) return '0';
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
    return value.toFixed(2);
}

function statusDotClass(status: string) {
    switch (status) {
        case 'success':
            return 'bg-emerald-500';
        case 'partial':
            return 'bg-amber-500';
        case 'failed':
            return 'bg-destructive';
        case 'skipped':
            return 'bg-amber-500';
        default:
            return 'bg-muted-foreground/40';
    }
}

function cardToneClass(tone: 'default' | 'danger' | 'muted' | 'warning') {
    switch (tone) {
        case 'danger':
            return 'border-destructive/25 bg-gradient-to-br from-destructive/[0.04] via-card to-card';
        case 'muted':
            return 'border-border/60 bg-muted/20 opacity-80';
        case 'warning':
            return 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.04] via-card to-card';
        case 'default':
        default:
            return 'border-border bg-card/40';
    }
}

function isCloudflareProtectionMessage(message?: string | null) {
    const lowered = (message ?? '').toLowerCase();
    return lowered.includes('cloudflare') || message?.includes('Cloudflare 保护') === true;
}

function formatDateTime(at?: string | null) {
    if (!at) return '-';
    try {
        return new Date(at).toLocaleString();
    } catch {
        return at;
    }
}

function ExecutionSummary({
    label,
    status,
    at,
    message,
}: {
    label: string;
    status: string;
    at?: string | null;
    message?: string | null;
}) {
    const statusText = status === 'success' ? '成功' : status === 'failed' ? '失败' : '空闲';
    const timeFormatted = at ? formatDateTime(at) : '';
    const summary = [`${label}${timeFormatted ? ' ' + timeFormatted : ''}`, statusText];
    if (message) {
        summary.push(message);
    }

    const cloudflareProtected = isCloudflareProtectionMessage(message);
    const summaryText = summary.join(' · ');

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-help">
                    <span
                        className={cn(
                            'size-2 shrink-0 rounded-full',
                            cloudflareProtected ? 'bg-amber-500' : statusDotClass(status),
                        )}
                    />
                    <span className="min-w-0 truncate">
                        {cloudflareProtected ? 'Cloudflare 保护 · ' : ''}
                        {summaryText}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{summaryText}</TooltipContent>
        </Tooltip>
    );
}

interface AccountRowProps {
    account: SiteAccount;
    site: SiteRecord;
    isSyncing: boolean;
    isCheckingIn: boolean;
    isToggling: boolean;
    onToggle: (account: SiteAccount) => void;
    onSync: (account: SiteAccount) => void;
    onCheckin: (account: SiteAccount) => void;
    onEdit: (site: SiteRecord, account: SiteAccount) => void;
    onDelete: (account: SiteAccount) => void;
    onJumpToChannel: (siteId: number, accountId: number) => void;
    isHighlighted: boolean;
}

export function AccountRow({
    account,
    site,
    isSyncing,
    isCheckingIn,
    isToggling,
    onToggle,
    onSync,
    onCheckin,
    onEdit,
    onDelete,
    onJumpToChannel,
    isHighlighted
}: AccountRowProps) {
    const t = useTranslations() as unknown as (key: string, values?: Record<string, string | number>) => string;
    const locale = useSettingStore((state) => state.locale);

    const accountFailed = accountHasHealthFailure(site, account);
    const accountTone = accountFailed
        ? 'danger'
        : account.enabled
            ? 'default'
            : 'muted';

    const supportsCheckin = deriveCheckinStatus(site, account) !== null;
    const canShowManualCheckin = supportsCheckin && accountHasCheckinEnabled(account, site.platform);

    const handleToggle = useCallback(() => {
        onToggle(account);
    }, [account, onToggle]);

    const handleSync = useCallback(() => {
        onSync(account);
    }, [account, onSync]);

    const handleCheckin = useCallback(() => {
        onCheckin(account);
    }, [account, onCheckin]);

    return (
        <article
            className={cn(
                'rounded-xl border px-4 py-3 transition-colors',
                cardToneClass(accountTone),
                isHighlighted && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
            )}
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold truncate max-w-[200px]" title={account.name}>
                                {account.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                                {t(`site.credentials.${account.credential_type}`) || account.credential_type}
                            </Badge>
                            <Badge
                                variant="outline"
                                className={cn(
                                    'text-[10px] px-1.5 h-5',
                                    account.enabled ? 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5' : 'text-muted-foreground'
                                )}
                            >
                                {account.enabled ? t('site.account.enabled') : t('site.account.disabled')}
                            </Badge>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                                {t('site.account.groups')}: <strong className="text-foreground">{account.user_groups?.length || 0}</strong>
                            </span>
                            <span className="text-muted-foreground">
                                {t('site.account.models')}: <strong className="text-foreground">{account.models?.length || 0}</strong>
                            </span>
                            <span className="text-muted-foreground">
                                {t('site.account.balance')}: <strong className="text-foreground">${formatBalance(account.balance)}</strong>
                            </span>
                            <span className="text-muted-foreground">
                                {t('site.account.todayIncome')}: <strong className="text-foreground">${formatBalance(account.today_income)}</strong>
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{account.auto_sync ? t('site.account.autoSync') : t('site.account.manualSync')}</span>
                            {supportsCheckin && (
                                <span>
                                    {account.auto_checkin
                                        ? account.random_checkin
                                            ? t('site.account.randomCheckin')
                                            : t('site.account.autoCheckin')
                                        : t('site.account.manualCheckin')}
                                </span>
                            )}
                            {account.account_proxy && (
                                <span className="truncate max-w-[200px]" title={account.account_proxy}>
                                    {t('site.account.proxy')}: {account.account_proxy}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 self-start">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <Switch
                                        checked={account.enabled}
                                        disabled={isToggling}
                                        onCheckedChange={handleToggle}
                                    />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {account.enabled ? t('site.account.disabled') : t('site.account.enabled')}
                            </TooltipContent>
                        </Tooltip>

                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-lg"
                            disabled={isSyncing}
                            onClick={handleSync}
                            title={t('site.account.sync')}
                        >
                            <RefreshCw className={cn('size-4 text-muted-foreground hover:text-foreground', isSyncing && 'animate-spin')} />
                        </Button>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 rounded-lg"
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                className="w-44 rounded-xl border border-border/60 bg-card p-1 shadow-md"
                            >
                                <div className="grid gap-0.5">
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                        onClick={() => onJumpToChannel(site.id, account.id)}
                                    >
                                        <Waypoints className="size-3.5" />
                                        <span>{t('site.card.viewChannels')}</span>
                                    </button>
                                    {canShowManualCheckin && (
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={handleCheckin}
                                            disabled={isCheckingIn}
                                        >
                                            <CalendarCheck2 className="size-3.5" />
                                            <span>{t('site.account.immediateCheckin')}</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                        onClick={() => onEdit(site, account)}
                                    >
                                        <Pencil className="size-3.5" />
                                        <span>{t('site.account.edit')}</span>
                                    </button>
                                    <div className="my-1 border-t border-border/60" />
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-destructive transition-colors hover:bg-destructive/10"
                                        onClick={() => onDelete(account)}
                                    >
                                        <Trash2 className="size-3.5" />
                                        <span>{t('site.account.delete')}</span>
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <div className="space-y-1 border-t border-border/30 pt-2">
                    <ExecutionSummary
                        label={t('site.account.syncStatus')}
                        status={account.last_sync_status || 'idle'}
                        at={account.last_sync_at}
                        message={translateSiteMessage(locale, account.last_sync_message, t) || t('site.account.waitingSync')}
                    />
                    {supportsCheckin && account.auto_checkin && (
                        <ExecutionSummary
                            label={t('site.account.checkinStatus')}
                            status={account.last_checkin_status || 'idle'}
                            at={account.last_checkin_at}
                            message={account.last_checkin_message || t('site.account.waitingCheckin')}
                        />
                    )}
                </div>
            </div>
        </article>
    );
}
