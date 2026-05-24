'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Globe2 } from 'lucide-react';
import {
    useSiteChannelList,
    useCreateSiteChannelKey,
    useUpdateSiteSourceKeys,
    useUpdateSiteChannelModelDisabled,
    useUpdateSiteChannelModelRoutes,
    type SiteChannelGroup,
    type SiteChannelModel,
    type SiteSourceKeyUpdateRequest,
    type SiteModelRouteUpdateRequest
} from '@/api/endpoints/site-channel';
import { useEnableChannel } from '@/api/endpoints/channel';
import { useJumpStore, isSiteChannelJumpTarget } from '@/stores/jump';
import { useSettingStore } from '@/stores/setting';
import { SiteSelector } from './SiteSelector';
import { ChannelGrid } from './ChannelGrid';
import { SourceKeysDialog, ModelRouteDialog } from './ChannelActions';
import { EmptyState } from '@/components/shared/empty-state';
import { translateSiteMessage } from '../../site/site-message';

export default function SiteChannelSection() {
    const locale = useSettingStore((state) => state.locale);
    const { data: cards, isLoading, error } = useSiteChannelList();

    // Selection states
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

    // Mutations
    const createProjected = useCreateSiteChannelKey(selectedSiteId ?? 0, selectedAccountId ?? 0);
    const updateSourceKeys = useUpdateSiteSourceKeys(selectedSiteId ?? 0, selectedAccountId ?? 0);
    const updateModelDisabled = useUpdateSiteChannelModelDisabled();
    const updateModelRoute = useUpdateSiteChannelModelRoutes(selectedSiteId ?? 0, selectedAccountId ?? 0);
    const enableChannel = useEnableChannel();

    // Dialog states
    const [isKeysOpen, setIsKeysOpen] = useState(false);
    const [activeGroupForKeys, setActiveGroupForKeys] = useState<SiteChannelGroup | null>(null);

    const [isRouteOpen, setIsRouteOpen] = useState(false);
    const [activeGroupForRoute, setActiveGroupForRoute] = useState<SiteChannelGroup | null>(null);
    const [activeModelForRoute, setActiveModelForRoute] = useState<SiteChannelModel | null>(null);

    // Operation pending states
    const [togglingChannelIds, setTogglingChannelIds] = useState<Set<number>>(new Set());
    const [togglingModelKeys, setTogglingModelKeys] = useState<Set<string>>(new Set());

    // Jump handling
    const pendingJump = useJumpStore((state) => state.pending);
    const clearPending = useJumpStore((state) => state.clearPending);

    useEffect(() => {
        if (cards && cards.length > 0) {
            const hasJump = pendingJump && isSiteChannelJumpTarget(pendingJump.target);
            if (hasJump) return;

            if (selectedSiteId === null) {
                const firstCard = cards[0];
                setSelectedSiteId(firstCard.site_id);
                if (firstCard.accounts && firstCard.accounts.length > 0) {
                    setSelectedAccountId(firstCard.accounts[0].account_id);
                }
            }
        }
    }, [cards, selectedSiteId, pendingJump]);

    useEffect(() => {
        if (pendingJump && isSiteChannelJumpTarget(pendingJump.target)) {
            const { siteId } = pendingJump.target;
            setSelectedSiteId(siteId);

            const card = cards?.find((c) => c.site_id === siteId);
            if (card) {
                if (pendingJump.target.kind === 'site-channel-account' || pendingJump.target.kind === 'site-channel-model') {
                    const { accountId } = pendingJump.target;
                    setSelectedAccountId(accountId);

                    if (pendingJump.target.kind === 'site-channel-model') {
                        const { groupKey, modelName } = pendingJump.target;
                        setTimeout(() => {
                            const el = document.getElementById(`model-row-${groupKey}-${modelName}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Apply CSS animation highlight class if available
                            el?.classList.add('bg-primary/10');
                            setTimeout(() => el?.classList.remove('bg-primary/10'), 2000);
                        }, 500);
                    }
                } else if (card.accounts && card.accounts.length > 0) {
                    setSelectedAccountId(card.accounts[0].account_id);
                }
            }
            clearPending(pendingJump.requestId);
        }
    }, [pendingJump, cards, clearPending]);

    const activeCard = useMemo(() => {
        return cards?.find((c) => c.site_id === selectedSiteId) ?? null;
    }, [cards, selectedSiteId]);

    const activeAccount = useMemo(() => {
        if (!activeCard) return null;
        return activeCard.accounts.find((a) => a.account_id === selectedAccountId) ?? null;
    }, [activeCard, selectedAccountId]);

    const handleSelect = useCallback((siteId: number, accountId: number) => {
        setSelectedSiteId(siteId);
        setSelectedAccountId(accountId);
    }, []);

    const handleEditKeys = useCallback((group: SiteChannelGroup) => {
        setActiveGroupForKeys(group);
        setIsKeysOpen(true);
    }, []);

    const handleEditRoute = useCallback((group: SiteChannelGroup, model: SiteChannelModel) => {
        setActiveGroupForRoute(group);
        setActiveModelForRoute(model);
        setIsRouteOpen(true);
    }, []);

    // Mutation triggers
    const handleCreateProjected = useCallback(
        async (group: SiteChannelGroup) => {
            if (!selectedSiteId || !selectedAccountId) return;
            await toast.promise(
                createProjected.mutateAsync({
                    group_key: group.group_key,
                    name: group.group_name
                }),
                {
                    loading: '正在投影生成渠道...',
                    success: '投影渠道创建成功',
                    error: (err) => `投影失败: ${translateSiteMessage(locale, err)}`
                }
            );
        },
        [selectedSiteId, selectedAccountId, createProjected, locale]
    );

    const handleToggleProjectedChannel = useCallback(
        async (channelId: number, enabled: boolean) => {
            setTogglingChannelIds((prev) => new Set(prev).add(channelId));
            try {
                await enableChannel.mutateAsync({ id: channelId, enabled });
                toast.success('投影渠道状态已更新');
            } catch (err) {
                toast.error(`更新投影渠道失败: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setTogglingChannelIds((prev) => {
                    const next = new Set(prev);
                    next.delete(channelId);
                    return next;
                });
            }
        },
        [enableChannel]
    );

    const handleToggleModel = useCallback(
        async (group: SiteChannelGroup, modelName: string, disabled: boolean) => {
            if (!selectedSiteId || !selectedAccountId) return;
            const modelKey = `${group.group_key}:${modelName}`;
            setTogglingModelKeys((prev) => new Set(prev).add(modelKey));

            try {
                await updateModelDisabled.mutateAsync({
                    siteId: selectedSiteId,
                    accountId: selectedAccountId,
                    payload: [{ group_key: group.group_key, model_name: modelName, disabled }]
                });
                toast.success(disabled ? '模型已禁用' : '模型已启用');
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                toast.error(`更新模型状态失败: ${translateSiteMessage(locale, errMsg)}`);
            } finally {
                setTogglingModelKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(modelKey);
                    return next;
                });
            }
        },
        [selectedSiteId, selectedAccountId, updateModelDisabled, locale]
    );

    const handleSaveKeys = useCallback(
        async (payload: SiteSourceKeyUpdateRequest) => {
            if (!selectedSiteId || !selectedAccountId) return;
            try {
                await updateSourceKeys.mutateAsync(payload);
                toast.success('源 Key 更新成功');
                setIsKeysOpen(false);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                toast.error(`更新 Key 失败: ${translateSiteMessage(locale, errMsg)}`);
            }
        },
        [selectedSiteId, selectedAccountId, updateSourceKeys, locale]
    );

    const handleSaveRoute = useCallback(
        async (payload: SiteModelRouteUpdateRequest[]) => {
            if (!selectedSiteId || !selectedAccountId) return;
            try {
                await updateModelRoute.mutateAsync(payload);
                toast.success('路由配置已更新');
                setIsRouteOpen(false);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                toast.error(`更新路由失败: ${translateSiteMessage(locale, errMsg)}`);
            }
        },
        [selectedSiteId, selectedAccountId, updateModelRoute, locale]
    );

    if (isLoading) {
        return (
            <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">
                正在加载站点投影工作台数据...
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive flex items-center gap-3">
                <Globe2 className="size-5 shrink-0" />
                <div>
                    <div className="font-semibold">加载工作台失败</div>
                    <div className="text-xs text-destructive/80 mt-1">{error.message}</div>
                </div>
            </div>
        );
    }

    if (!cards || cards.length === 0) {
        return (
            <EmptyState
                title="暂无关联站点"
                description="托管同步工作台必须依赖至少一个有效站点。请先到「站点」页面新建并完成首次同步。"
                icon={Globe2}
            />
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <SiteSelector
                cards={cards}
                selectedSiteId={selectedSiteId}
                selectedAccountId={selectedAccountId}
                onSelect={handleSelect}
            />

            {activeAccount && activeAccount.groups ? (
                <ChannelGrid
                    groups={activeAccount.groups}
                    onEditKeys={handleEditKeys}
                    onCreateProjectedChannel={handleCreateProjected}
                    isCreatingProjected={createProjected.isPending}
                    onToggleProjectedChannel={handleToggleProjectedChannel}
                    togglingChannelIds={togglingChannelIds}
                    onEditRoute={handleEditRoute}
                    onToggleModel={handleToggleModel}
                    togglingModelKeys={togglingModelKeys}
                />
            ) : (
                <EmptyState
                    title="无账号数据"
                    description="该站点下暂无任何已同步成功的账号。请在站点管理中新增并手动同步账号。"
                />
            )}

            <SourceKeysDialog
                open={isKeysOpen}
                onOpenChange={setIsKeysOpen}
                group={activeGroupForKeys}
                onSave={handleSaveKeys}
                isSaving={updateSourceKeys.isPending}
            />

            <ModelRouteDialog
                open={isRouteOpen}
                onOpenChange={setIsRouteOpen}
                group={activeGroupForRoute}
                model={activeModelForRoute}
                onSave={handleSaveRoute}
                isSaving={updateModelRoute.isPending}
            />
        </div>
    );
}
