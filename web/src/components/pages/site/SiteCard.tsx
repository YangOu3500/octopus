'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
    Waypoints,
    Plus,
    Pencil,
    Trash2,
    MoreHorizontal,
    ChevronDown,
    Pin,
    PinOff,
    Power,
    Archive,
    Link2,
    Square,
    CheckSquare
} from 'lucide-react';
import {
    type Site as SiteRecord,
    type SiteAccount,
} from '@/api/endpoints/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AccountRow, formatBalance } from './AccountRow';

interface SiteCardProps {
    site: SiteRecord;
    summary: {
        healthTone: 'default' | 'danger' | 'muted' | 'warning';
        healthLabel: string;
        accountCount: number;
        keyCount: number;
        modelCount: number;
        balance: number;
        todayIncome: number;
    };
    visibleAccounts: SiteAccount[];
    forceExpanded: boolean;
    hasFilteredAccounts: boolean;
    isSelected: boolean;
    onToggleSelect: (siteId: number) => void;
    isExpanded: boolean;
    onToggleExpand: (siteId: number) => void;
    onJumpToChannel: (siteId: number) => void;
    onAddAccount: (site: SiteRecord) => void;
    onEditSite: (site: SiteRecord) => void;
    onTogglePin: (site: SiteRecord) => void;
    onToggleSite: (site: SiteRecord) => void;
    onArchiveSite: (site: SiteRecord) => void;
    onDeleteSite: (site: SiteRecord) => void;
    // Account actions forwarded
    onToggleAccount: (account: SiteAccount) => void;
    onSyncAccount: (account: SiteAccount) => void;
    onCheckinAccount: (account: SiteAccount) => void;
    onEditAccount: (site: SiteRecord, account: SiteAccount) => void;
    onDeleteAccount: (account: SiteAccount) => void;
    onJumpToAccountChannel: (siteId: number, accountId: number) => void;
    syncingAccountIds: Set<number>;
    checkinAccountIds: Set<number>;
    togglingAccountIds: Set<number>;
    highlightedSiteId: number | null;
    highlightedAccountId: number | null;
}

function cardToneClass(tone: 'default' | 'danger' | 'muted' | 'warning') {
    switch (tone) {
        case 'danger':
            return 'border-destructive/25 bg-gradient-to-br from-destructive/[0.04] via-card to-card';
        case 'muted':
            return 'border-border/60 bg-muted/10 opacity-80';
        case 'warning':
            return 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.04] via-card to-card';
        case 'default':
        default:
            return 'border-border bg-card';
    }
}

function badgeToneClass(tone: 'default' | 'danger' | 'muted' | 'warning') {
    switch (tone) {
        case 'danger':
            return 'border-destructive/20 bg-destructive/10 text-destructive';
        case 'muted':
            return 'border-border bg-muted/40 text-muted-foreground';
        case 'warning':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'default':
        default:
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    }
}

export function SiteCard({
    site,
    summary,
    visibleAccounts,
    forceExpanded,
    hasFilteredAccounts,
    isSelected,
    onToggleSelect,
    isExpanded,
    onToggleExpand,
    onJumpToChannel,
    onAddAccount,
    onEditSite,
    onTogglePin,
    onToggleSite,
    onArchiveSite,
    onDeleteSite,
    onToggleAccount,
    onSyncAccount,
    onCheckinAccount,
    onEditAccount,
    onDeleteAccount,
    onJumpToAccountChannel,
    syncingAccountIds,
    checkinAccountIds,
    togglingAccountIds,
    highlightedSiteId,
    highlightedAccountId
}: SiteCardProps) {
    const t = useTranslations() as unknown as (key: string, values?: Record<string, string | number>) => string;
    const showAccounts = forceExpanded || isExpanded;

    const handleToggleSelect = useCallback(() => {
        onToggleSelect(site.id);
    }, [site.id, onToggleSelect]);

    const handleToggleExpand = useCallback(() => {
        onToggleExpand(site.id);
    }, [site.id, onToggleExpand]);

    return (
        <section
            className={cn(
                'rounded-xl border p-5 transition-all duration-300',
                cardToneClass(summary.healthTone),
                highlightedSiteId === site.id && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
            )}
        >
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    className="mt-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                    title={isSelected ? '取消选择' : '选择'}
                    onClick={handleToggleSelect}
                >
                    {isSelected ? (
                        <CheckSquare className="size-5 text-primary" />
                    ) : (
                        <Square className="size-5" />
                    )}
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div
                            className="min-w-0 flex-1 cursor-pointer text-left"
                            onClick={handleToggleExpand}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-base font-semibold">{site.name}</h3>
                                {site.is_pinned && (
                                    <Badge variant="outline" className="text-amber-600 border-amber-500/20 bg-amber-500/5 text-[10px] h-5">
                                        <Pin className="mr-1 size-3" />
                                        {t('site.card.pin')}
                                    </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px] h-5">
                                    {t(`site.platforms.${site.platform}`) || site.platform}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={cn('text-[10px] h-5', badgeToneClass(summary.healthTone))}
                                >
                                    {summary.healthLabel}
                                </Badge>
                            </div>

                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Link2 className="size-3.5 shrink-0" />
                                <a
                                    href={site.base_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate hover:text-foreground hover:underline transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {site.base_url}
                                </a>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                <span className="text-muted-foreground">
                                    {t('site.card.accounts')}: <strong className="text-foreground">{summary.accountCount}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                    {t('site.card.keys')}: <strong className="text-foreground">{summary.keyCount}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                    {t('site.card.models')}: <strong className="text-foreground">{summary.modelCount}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                    {t('site.card.balance')}: <strong className="text-foreground">${formatBalance(summary.balance)}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                    {t('site.card.todayIncome')}: <strong className="text-foreground">${formatBalance(summary.todayIncome)}</strong>
                                </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                <span>
                                    {site.proxy
                                        ? t('site.card.proxy')
                                        : site.use_system_proxy
                                            ? t('site.card.systemProxy')
                                            : t('site.card.direct')}
                                </span>
                                {site.site_proxy && (
                                    <span className="truncate max-w-[150px]">{site.site_proxy}</span>
                                )}
                                {site.custom_header && site.custom_header.length > 0 && (
                                    <span>{t('site.card.customHeaders', { count: site.custom_header.length })}</span>
                                )}
                                {site.external_checkin_url && (
                                    <span>{t('site.card.manualCheckin')}</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 self-start">
                            {site.accounts?.length === 0 && (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 rounded-lg"
                                    onClick={() => onAddAccount(site)}
                                    title={t('site.card.addAccount')}
                                >
                                    <Plus className="size-4" />
                                </Button>
                            )}

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
                                    className="w-48 rounded-xl border border-border/60 bg-card p-1 shadow-md"
                                >
                                    <div className="grid gap-0.5">
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={() => onJumpToChannel(site.id)}
                                        >
                                            <Waypoints className="size-3.5" />
                                            <span>{t('site.card.viewChannels')}</span>
                                        </button>
                                        {site.accounts?.length > 0 && (
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                                onClick={() => onAddAccount(site)}
                                            >
                                                <Plus className="size-3.5" />
                                                <span>{t('site.card.addAccount')}</span>
                                            </button>
                                        )}
                                        <div className="my-1 border-t border-border/60" />
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={() => onEditSite(site)}
                                        >
                                            <Pencil className="size-3.5" />
                                            <span>{t('site.card.edit')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={() => onTogglePin(site)}
                                        >
                                            {site.is_pinned ? (
                                                <PinOff className="size-3.5" />
                                            ) : (
                                                <Pin className="size-3.5" />
                                            )}
                                            <span>{site.is_pinned ? t('site.card.unpin') : t('site.card.pin')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={() => onToggleSite(site)}
                                        >
                                            <Power className="size-3.5" />
                                            <span>{site.enabled ? t('site.card.disable') : t('site.card.enable')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-muted"
                                            onClick={() => onArchiveSite(site)}
                                        >
                                            <Archive className="size-3.5" />
                                            <span>{t('site.card.archive')}</span>
                                        </button>
                                        <div className="my-1 border-t border-border/60" />
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-destructive transition-colors hover:bg-destructive/10"
                                            onClick={() => onDeleteSite(site)}
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span>{t('site.card.delete')}</span>
                                        </button>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 rounded-lg"
                                disabled={forceExpanded || site.accounts?.length === 0}
                                onClick={handleToggleExpand}
                                title={showAccounts ? '收起账号' : '展开账号'}
                            >
                                <ChevronDown
                                    className={cn(
                                        'size-4 transition-transform text-muted-foreground',
                                        showAccounts && 'rotate-180'
                                    )}
                                />
                            </Button>
                        </div>
                    </div>

                    {showAccounts && (
                        <div className="mt-4 border-t border-border/40 pt-4 space-y-2">
                            {hasFilteredAccounts && (
                                <div className="mb-2 text-[10px] text-muted-foreground">
                                    显示 {visibleAccounts.length} / {site.accounts?.length || 0} 个账号
                                </div>
                            )}

                            {visibleAccounts.length === 0 ? (
                                <div className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                                    没有匹配的账号。
                                </div>
                            ) : (
                                visibleAccounts.map((account) => (
                                    <AccountRow
                                        key={account.id}
                                        account={account}
                                        site={site}
                                        isSyncing={syncingAccountIds.has(account.id)}
                                        isCheckingIn={checkinAccountIds.has(account.id)}
                                        isToggling={togglingAccountIds.has(account.id)}
                                        onToggle={onToggleAccount}
                                        onSync={onSyncAccount}
                                        onCheckin={onCheckinAccount}
                                        onEdit={onEditAccount}
                                        onDelete={onDeleteAccount}
                                        onJumpToChannel={onJumpToAccountChannel}
                                        isHighlighted={highlightedAccountId === account.id}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
