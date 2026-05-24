'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
    Plus,
    RefreshCw,
    CalendarCheck,
    Upload,
    Archive,
    Search,
    AlertCircle,
    Power,
    Trash
} from 'lucide-react';
import {
    type Site as SiteRecord,
    type SiteAccount,
    SitePlatform,
    useSiteList,
    useCreateSite,
    useUpdateSite,
    useEnableSite,
    useDeleteSite,
    useArchiveSite,
    useRestoreSite,
    useCreateSiteAccount,
    useUpdateSiteAccount,
    useEnableSiteAccount,
    useDeleteSiteAccount,
    useSyncSiteAccount,
    useCheckinSiteAccount,
    useSyncAllSites,
    useCheckinAllSites,
    useImportAllAPIHub,
    useImportMetAPI,
    useDetectSitePlatform,
    useSiteBatchAction
} from '@/api/endpoints/site';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import { useJumpStore } from '@/stores/jump';
import { useSettingStore } from '@/stores/setting';
import { cn } from '@/lib/utils';
import { CheckinPanel } from './CheckinPanel';
import { SiteCard } from './SiteCard';
import { SiteFormDialog, type SiteFormState } from './SiteFormDialog';
import { AccountFormDialog, type SiteAccountSavePayload } from './AccountFormDialog';
import { ImportDialog } from './ImportDialog';
import { ArchivedDialog } from './ArchivedDialog';
import { accountMatchesCheckinFilter, type CheckinFilterStatus } from './checkin-status';
import { translateSiteMessage } from './site-message';

export function Site() {
    const t = useTranslations() as unknown as (key: string, values?: Record<string, string | number>) => string;
    const locale = useSettingStore((state) => state.locale);
    const { data: sites, isLoading, error } = useSiteList();

    // Mutations
    const createSite = useCreateSite();
    const updateSite = useUpdateSite();
    const enableSite = useEnableSite();
    const deleteSite = useDeleteSite();
    const archiveSite = useArchiveSite();
    const restoreSite = useRestoreSite();

    const createAccount = useCreateSiteAccount();
    const updateAccount = useUpdateSiteAccount();
    const enableAccount = useEnableSiteAccount();
    const deleteAccount = useDeleteSiteAccount();

    const syncAccount = useSyncSiteAccount();
    const checkinAccount = useCheckinSiteAccount();

    const syncAll = useSyncAllSites();
    const checkinAll = useCheckinAllSites();

    const importAllAPIHub = useImportAllAPIHub();
    const importMetAPI = useImportMetAPI();
    const detectPlatform = useDetectSitePlatform();
    const batchAction = useSiteBatchAction();

    // UI state
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<CheckinFilterStatus>('all');
    const [selectedSiteIds, setSelectedSiteIds] = useState<Set<number>>(new Set());
    const [expandedSiteIds, setExpandedSiteIds] = useState<Set<number>>(new Set());

    // Modal states
    const [isSiteDialogOpen, setIsSiteDialogOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);

    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [accountSite, setAccountSite] = useState<SiteRecord | null>(null);
    const [editingAccount, setEditingAccount] = useState<SiteAccount | null>(null);

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);

    // Track active async operations for loading states
    const [syncingAccountIds, setSyncingAccountIds] = useState<Set<number>>(new Set());
    const [checkinAccountIds, setCheckinAccountIds] = useState<Set<number>>(new Set());
    const [togglingAccountIds, setTogglingAccountIds] = useState<Set<number>>(new Set());

    // Jump target highlighting
    const pendingJump = useJumpStore((state) => state.pending);
    const clearPending = useJumpStore((state) => state.clearPending);
    const requestJump = useJumpStore((state) => state.requestJump);
    const [highlightedSiteId, setHighlightedSiteId] = useState<number | null>(null);
    const [highlightedAccountId, setHighlightedAccountId] = useState<number | null>(null);

    useEffect(() => {
        if (pendingJump) {
            if (pendingJump.target.kind === 'site-card') {
                const { siteId } = pendingJump.target;
                setHighlightedSiteId(siteId);
                setHighlightedAccountId(null);
                setExpandedSiteIds((prev) => {
                    const next = new Set(prev);
                    next.add(siteId);
                    return next;
                });
                clearPending(pendingJump.requestId);
                setTimeout(() => {
                    document.getElementById(`site-card-${siteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            } else if (pendingJump.target.kind === 'site-account') {
                const { siteId, accountId } = pendingJump.target;
                setHighlightedSiteId(siteId);
                setHighlightedAccountId(accountId);
                setExpandedSiteIds((prev) => {
                    const next = new Set(prev);
                    next.add(siteId);
                    return next;
                });
                clearPending(pendingJump.requestId);
                setTimeout(() => {
                    document.getElementById(`account-row-${accountId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }, [pendingJump, clearPending]);

    // Inventory summary for stats
    const inventory = useMemo(() => {
        let totalBalance = 0;
        let totalBalanceUsed = 0;
        let enabledAccounts = 0;
        let totalAccounts = 0;

        for (const site of sites ?? []) {
            for (const acc of site.accounts ?? []) {
                totalAccounts++;
                if (acc.enabled && site.enabled) {
                    enabledAccounts++;
                }
                totalBalance += acc.balance ?? 0;
                totalBalanceUsed += acc.balance_used ?? 0;
            }
        }

        return { totalBalance, totalBalanceUsed, enabledAccounts, totalAccounts };
    }, [sites]);

    const statusDayKey = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }, []);

    // Filter accounts and sites
    const now = useMemo(() => new Date(), []);
    const visibleSites = useMemo(() => {
        if (!sites) return [];

        return sites
            .map((site) => {
                const visibleAccounts = (site.accounts ?? []).filter((account) => {
                    const matchSearch =
                        !searchTerm.trim() ||
                        site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (account.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (account.username ?? '').toLowerCase().includes(searchTerm.toLowerCase());

                    const matchCheckin = accountMatchesCheckinFilter(site, account, filterStatus, now);
                    return matchSearch && matchCheckin;
                });

                const hasFilteredAccounts = visibleAccounts.length < (site.accounts ?? []).length;
                const siteMatchesSearch = searchTerm ? site.name.toLowerCase().includes(searchTerm.toLowerCase()) : false;

                const isVisible =
                    filterStatus === 'all'
                        ? site.accounts?.length === 0
                            ? searchTerm
                                ? siteMatchesSearch
                                : true
                            : visibleAccounts.length > 0 || siteMatchesSearch
                        : visibleAccounts.length > 0;

                return { ...site, visibleAccounts, hasFilteredAccounts, isVisible };
            })
            .filter((s) => s.isVisible);
    }, [sites, searchTerm, filterStatus, now]);

    const visibleAccountsCount = useMemo(() => {
        return visibleSites.reduce((acc, site) => acc + site.visibleAccounts.length, 0);
    }, [visibleSites]);

    const forceExpanded = searchTerm.trim().length > 0 || filterStatus !== 'all';

    const getSiteSummary = useCallback(
        (site: SiteRecord) => {
            let balance = 0;
            let todayIncome = 0;
            let keyCount = 0;
            let modelCount = 0;
            let hasFailedCheckin = false;
            let hasFailedSync = false;

            for (const acc of site.accounts ?? []) {
                balance += acc.balance ?? 0;
                todayIncome += acc.today_income ?? 0;
                keyCount += acc.tokens?.length ?? 0;
                modelCount += acc.models?.length ?? 0;

                if (acc.enabled && site.enabled) {
                    if (acc.last_checkin_status === 'failed') hasFailedCheckin = true;
                    if (acc.last_sync_status === 'failed') hasFailedSync = true;
                }
            }

            let healthTone: 'default' | 'danger' | 'muted' | 'warning' = 'default';
            let healthLabel = t('site.card.statusNormal') || '正常';

            if (!site.enabled) {
                healthTone = 'muted';
                healthLabel = t('site.account.disabled') || '已停用';
            } else if (hasFailedSync) {
                healthTone = 'danger';
                healthLabel = t('site.card.statusSyncError') || '同步异常';
            } else if (hasFailedCheckin) {
                healthTone = 'warning';
                healthLabel = t('site.card.statusCheckinError') || '签到异常';
            }

            return {
                healthTone,
                healthLabel,
                accountCount: site.accounts?.length ?? 0,
                keyCount,
                modelCount,
                balance,
                todayIncome,
            };
        },
        [t]
    );

    // Handlers
    const handleClearFilters = useCallback(() => {
        setSearchTerm('');
        setFilterStatus('all');
    }, []);

    const handleToggleSelectSite = useCallback((siteId: number) => {
        setSelectedSiteIds((prev) => {
            const next = new Set(prev);
            if (next.has(siteId)) next.delete(siteId);
            else next.add(siteId);
            return next;
        });
    }, []);

    const handleToggleExpandSite = useCallback((siteId: number) => {
        setExpandedSiteIds((prev) => {
            const next = new Set(prev);
            if (next.has(siteId)) next.delete(siteId);
            else next.add(siteId);
            return next;
        });
    }, []);

    const handleJumpToChannel = useCallback(
        (siteId: number) => {
            requestJump({ kind: 'site-channel-card', siteId });
        },
        [requestJump]
    );

    const handleJumpToAccountChannel = useCallback(
        (siteId: number, accountId: number) => {
            requestJump({ kind: 'site-channel-account', siteId, accountId });
        },
        [requestJump]
    );

    const handleOpenAddAccount = useCallback((site: SiteRecord) => {
        setAccountSite(site);
        setEditingAccount(null);
        setIsAccountDialogOpen(true);
    }, []);

    const handleOpenEditAccount = useCallback((site: SiteRecord, account: SiteAccount) => {
        setAccountSite(site);
        setEditingAccount(account);
        setIsAccountDialogOpen(true);
    }, []);

    const handleOpenEditSite = useCallback((site: SiteRecord) => {
        setEditingSite(site);
        setIsSiteDialogOpen(true);
    }, []);

    // Mutation handlers
    const handleSyncAll = useCallback(() => {
        toast.promise(syncAll.mutateAsync(), {
            loading: '正在同步所有站点...',
            success: '同步所有站点已触发，请稍后刷新查看进度。',
            error: (err) => `同步失败: ${translateSiteMessage(locale, err)}`
        });
    }, [syncAll, locale]);

    const handleCheckinAll = useCallback(() => {
        toast.promise(checkinAll.mutateAsync(), {
            loading: '正在执行所有站点签到...',
            success: '签到任务已触发。',
            error: (err) => `签到失败: ${translateSiteMessage(locale, err)}`
        });
    }, [checkinAll, locale]);

    const handleTogglePin = useCallback(
        (site: SiteRecord) => {
            updateSite.mutate({ id: site.id, is_pinned: !site.is_pinned });
        },
        [updateSite]
    );

    const handleToggleSite = useCallback(
        (site: SiteRecord) => {
            enableSite.mutate({ id: site.id, enabled: !site.enabled });
        },
        [enableSite]
    );

    const handleArchiveSite = useCallback(
        (site: SiteRecord) => {
            toast.promise(archiveSite.mutateAsync(site.id), {
                loading: `正在归档站点 ${site.name}...`,
                success: `站点 ${site.name} 已成功归档。`,
                error: (err) => `归档失败: ${translateSiteMessage(locale, err)}`
            });
        },
        [archiveSite, locale]
    );

    const handleDeleteSite = useCallback(
        (site: SiteRecord) => {
            if (!confirm(`确定要删除站点「${site.name}」吗？该操作不可逆！`)) return;
            toast.promise(deleteSite.mutateAsync(site.id), {
                loading: `正在删除站点 ${site.name}...`,
                success: `站点 ${site.name} 已成功删除。`,
                error: (err) => `删除失败: ${translateSiteMessage(locale, err)}`
            });
        },
        [deleteSite, locale]
    );

    const handleRestoreSite = useCallback(
        async (siteId: number, name: string) => {
            await toast.promise(restoreSite.mutateAsync(siteId), {
                loading: `正在恢复站点 ${name}...`,
                success: `站点 ${name} 已成功恢复为停用状态。`,
                error: (err) => `恢复失败: ${translateSiteMessage(locale, err)}`
            });
        },
        [restoreSite, locale]
    );

    const handleToggleAccount = useCallback(
        async (account: SiteAccount) => {
            setTogglingAccountIds((prev) => new Set(prev).add(account.id));
            try {
                await enableAccount.mutateAsync({ id: account.id, enabled: !account.enabled });
                toast.success('账号状态已切换');
            } catch (err) {
                toast.error(`状态切换失败: ${translateSiteMessage(locale, err)}`);
            } finally {
                setTogglingAccountIds((prev) => {
                    const next = new Set(prev);
                    next.delete(account.id);
                    return next;
                });
            }
        },
        [enableAccount, locale]
    );

    const handleSyncAccount = useCallback(
        async (account: SiteAccount) => {
            setSyncingAccountIds((prev) => new Set(prev).add(account.id));
            await toast.promise(syncAccount.mutateAsync(account.id), {
                loading: `正在同步账号 ${account.name}...`,
                success: (data) => `同步成功: 渠道 ${data.channel_count}, 密钥 ${data.token_count}`,
                error: (err) => `同步失败: ${translateSiteMessage(locale, err)}`
            });
            setSyncingAccountIds((prev) => {
                const next = new Set(prev);
                next.delete(account.id);
                return next;
            });
        },
        [syncAccount, locale]
    );

    const handleCheckinAccount = useCallback(
        async (account: SiteAccount) => {
            setCheckinAccountIds((prev) => new Set(prev).add(account.id));
            await toast.promise(checkinAccount.mutateAsync(account.id), {
                loading: `正在执行签到 ${account.name}...`,
                success: (data) => `签到成功: ${data.message || '已领取奖励'}`,
                error: (err) => `签到失败: ${translateSiteMessage(locale, err)}`
            });
            setCheckinAccountIds((prev) => {
                const next = new Set(prev);
                next.delete(account.id);
                return next;
            });
        },
        [checkinAccount, locale]
    );

    const handleDeleteAccount = useCallback(
        (account: SiteAccount) => {
            if (!confirm(`确定要删除账号「${account.name}」吗？`)) return;
            toast.promise(deleteAccount.mutateAsync(account.id), {
                loading: `正在删除账号 ${account.name}...`,
                success: `账号 ${account.name} 已成功删除。`,
                error: (err) => `删除失败: ${translateSiteMessage(locale, err)}`
            });
        },
        [deleteAccount, locale]
    );

    const handleSaveSite = useCallback(
        async (form: SiteFormState) => {
            try {
                if (form.platform === '') {
                    toast.error('请选择站点平台');
                    return;
                }
                const payload = {
                    ...form,
                    platform: form.platform as SitePlatform
                };
                if (editingSite) {
                    await updateSite.mutateAsync({ ...payload, id: editingSite.id });
                    toast.success('站点更新成功');
                } else {
                    await createSite.mutateAsync(payload);
                    toast.success('站点创建成功');
                }
                setIsSiteDialogOpen(false);
            } catch (err) {
                toast.error(`保存站点失败: ${translateSiteMessage(locale, err)}`);
            }
        },
        [editingSite, createSite, updateSite, locale]
    );

    const handleSaveAccount = useCallback(
        async (payload: SiteAccountSavePayload) => {
            try {
                if (editingAccount) {
                    await updateAccount.mutateAsync({ ...payload, id: editingAccount.id });
                    toast.success('账号更新成功');
                } else {
                    await createAccount.mutateAsync(payload);
                    toast.success('账号创建成功');
                }
                setIsAccountDialogOpen(false);
            } catch (err) {
                toast.error(`保存账号失败: ${translateSiteMessage(locale, err)}`);
            }
        },
        [editingAccount, createAccount, updateAccount, locale]
    );

    const handleDetectPlatform = useCallback(
        async (url: string) => {
            const res = await detectPlatform.mutateAsync(url);
            return res as unknown as { platform: string };
        },
        [detectPlatform]
    );

    const handleImport = useCallback(
        async (payload: { file: File | null; text: string }, source: 'all-api-hub' | 'metapi') => {
            if (source === 'all-api-hub') {
                const res = await importAllAPIHub.mutateAsync(payload);
                return res as unknown as {
                    created_sites: number;
                    reused_sites: number;
                    created_accounts: number;
                    updated_accounts: number;
                    skipped_accounts: number;
                    warnings: string[];
                };
            } else {
                const res = await importMetAPI.mutateAsync(payload);
                return res as unknown as {
                    created_sites: number;
                    reused_sites: number;
                    created_accounts: number;
                    updated_accounts: number;
                    skipped_accounts: number;
                    warnings: string[];
                };
            }
        },
        [importAllAPIHub, importMetAPI]
    );

    const handleBatchAction = useCallback(
        async (action: string) => {
            const ids = Array.from(selectedSiteIds);
            if (ids.length === 0) return;

            await toast.promise(batchAction.mutateAsync({ ids, action }), {
                loading: '正在批量执行操作...',
                success: (data) => {
                    setSelectedSiteIds(new Set());
                    const failedCount = data.failed_items?.length ?? 0;
                    if (failedCount > 0) {
                        return `批量操作完成。成功 ${data.success_ids.length} 项，失败 ${failedCount} 项。`;
                    }
                    return '批量操作已成功。';
                },
                error: (err) => `操作失败: ${translateSiteMessage(locale, err)}`
            });
        },
        [selectedSiteIds, batchAction, locale]
    );

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title={t('site.title')}
                description={t('site.description')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg h-9 text-xs"
                            onClick={handleSyncAll}
                            disabled={syncAll.isPending}
                        >
                            <RefreshCw className={cn('size-3.5 mr-1.5', syncAll.isPending && 'animate-spin')} />
                            {t('site.actions.syncAll')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg h-9 text-xs"
                            onClick={handleCheckinAll}
                            disabled={checkinAll.isPending}
                        >
                            <CalendarCheck className="size-3.5 mr-1.5" />
                            {t('site.actions.checkinAll')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg h-9 text-xs"
                            onClick={() => setIsImportOpen(true)}
                        >
                            <Upload className="size-3.5 mr-1.5" />
                            {t('site.actions.import')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg h-9 text-xs"
                            onClick={() => setIsArchiveOpen(true)}
                        >
                            <Archive className="size-3.5 mr-1.5" />
                            {t('site.actions.archived')}
                        </Button>
                        <Button
                            size="sm"
                            className="rounded-lg h-9 text-xs"
                            onClick={() => {
                                setEditingSite(null);
                                setIsSiteDialogOpen(true);
                            }}
                        >
                            <Plus className="size-3.5 mr-1.5" />
                            {t('site.actions.create')}
                        </Button>
                    </div>
                }
            />

            <CheckinPanel
                sites={sites}
                inventory={inventory}
                statusDayKey={statusDayKey}
                visibleSiteCount={visibleSites.length}
                visibleAccountCount={visibleAccountsCount}
                searchTerm={searchTerm}
                siteFilterLabel={null}
                hasActiveFilters={searchTerm.trim().length > 0 || filterStatus !== 'all'}
                onClearFilters={handleClearFilters}
                filterStatus={filterStatus}
                onFilterChange={setFilterStatus}
            />

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="搜索站点、账号..."
                        className="pl-9 h-9 rounded-lg text-xs"
                    />
                </div>

                {selectedSiteIds.size > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-1 text-xs">
                        <span className="text-muted-foreground">已选择 {selectedSiteIds.size} 项</span>
                        <div className="h-4 w-px bg-border mx-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-foreground rounded-md px-2"
                            onClick={() => handleBatchAction('enable')}
                            disabled={batchAction.isPending}
                        >
                            <Power className="size-3 mr-1 text-emerald-500" />
                            启用
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-foreground rounded-md px-2"
                            onClick={() => handleBatchAction('disable')}
                            disabled={batchAction.isPending}
                        >
                            <Power className="size-3 mr-1 text-muted-foreground" />
                            禁用
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-foreground rounded-md px-2"
                            onClick={() => handleBatchAction('archive')}
                            disabled={batchAction.isPending}
                        >
                            <Archive className="size-3 mr-1" />
                            归档
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive rounded-md px-2 hover:bg-destructive/10"
                            onClick={() => handleBatchAction('delete')}
                            disabled={batchAction.isPending}
                        >
                            <Trash className="size-3 mr-1" />
                            删除
                        </Button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">
                    正在加载站点列表...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive flex items-center gap-3">
                    <AlertCircle className="size-5 shrink-0" />
                    <div>
                        <div className="font-semibold">加载站点失败</div>
                        <div className="text-xs text-destructive/80 mt-1">{error.message}</div>
                    </div>
                </div>
            ) : visibleSites.length === 0 ? (
                <div className="rounded-xl border border-dashed py-20 text-center text-sm text-muted-foreground">
                    没有找到符合条件的站点。
                </div>
            ) : (
                <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    {visibleSites.map((site) => (
                        <div key={site.id} id={`site-card-${site.id}`}>
                            <SiteCard
                                site={site}
                                summary={getSiteSummary(site)}
                                visibleAccounts={site.visibleAccounts}
                                forceExpanded={forceExpanded}
                                hasFilteredAccounts={site.hasFilteredAccounts}
                                isSelected={selectedSiteIds.has(site.id)}
                                onToggleSelect={handleToggleSelectSite}
                                isExpanded={expandedSiteIds.has(site.id)}
                                onToggleExpand={handleToggleExpandSite}
                                onJumpToChannel={handleJumpToChannel}
                                onAddAccount={handleOpenAddAccount}
                                onEditSite={handleOpenEditSite}
                                onTogglePin={handleTogglePin}
                                onToggleSite={handleToggleSite}
                                onArchiveSite={handleArchiveSite}
                                onDeleteSite={handleDeleteSite}
                                onToggleAccount={handleToggleAccount}
                                onSyncAccount={handleSyncAccount}
                                onCheckinAccount={handleCheckinAccount}
                                onEditAccount={handleOpenEditAccount}
                                onDeleteAccount={handleDeleteAccount}
                                onJumpToAccountChannel={handleJumpToAccountChannel}
                                syncingAccountIds={syncingAccountIds}
                                checkinAccountIds={checkinAccountIds}
                                togglingAccountIds={togglingAccountIds}
                                highlightedSiteId={highlightedSiteId}
                                highlightedAccountId={highlightedAccountId}
                            />
                        </div>
                    ))}
                </div>
            )}

            <SiteFormDialog
                open={isSiteDialogOpen}
                onOpenChange={setIsSiteDialogOpen}
                editingSite={editingSite}
                onSave={handleSaveSite}
                isSaving={createSite.isPending || updateSite.isPending}
                onDetectPlatform={handleDetectPlatform}
                isDetecting={detectPlatform.isPending}
            />

            <AccountFormDialog
                open={isAccountDialogOpen}
                onOpenChange={setIsAccountDialogOpen}
                accountSite={accountSite}
                editingAccount={editingAccount}
                onSave={handleSaveAccount}
                isSaving={createAccount.isPending || updateAccount.isPending}
            />

            <ImportDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                onImport={handleImport}
                isImporting={importAllAPIHub.isPending || importMetAPI.isPending}
            />

            <ArchivedDialog
                open={isArchiveOpen}
                onOpenChange={setIsArchiveOpen}
                onRestore={handleRestoreSite}
                isRestoring={restoreSite.isPending}
            />
        </div>
    );
}
