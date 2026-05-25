'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Globe2 } from 'lucide-react';
import {
    useSiteChannelList,
    useCreateSiteChannelKey,
    useUpdateSiteSourceKeys,
    useUpdateSiteChannelModelDisabled,
    useUpdateSiteChannelModelRoutes,
    type SiteChannelCard,
    type SiteChannelAccount,
    type SiteChannelGroup,
    type SiteChannelModel,
    type SiteSourceKeyUpdateRequest,
    type SiteModelRouteUpdateRequest
} from '@/api/endpoints/site-channel';
import { useEnableChannel } from '@/api/endpoints/channel';
import { useJumpStore, isSiteChannelJumpTarget } from '@/stores/jump';
import { useSettingStore } from '@/stores/setting';
import { ChannelGrid } from './ChannelGrid';
import { SourceKeysDialog, ModelRouteDialog } from './ChannelActions';
import { EmptyState } from '@/components/shared/empty-state';
import { translateSiteMessage } from '../../site/site-message';
import { Badge } from '@/components/ui/badge';

interface AccountChannelSectionProps {
    card: SiteChannelCard;
    account: SiteChannelAccount;
    onEditKeys: (siteId: number, accountId: number, group: SiteChannelGroup) => void;
    onEditRoute: (siteId: number, accountId: number, group: SiteChannelGroup, model: SiteChannelModel) => void;
}

function AccountChannelSection({ card, account, onEditKeys, onEditRoute }: AccountChannelSectionProps) {
    const locale = useSettingStore((state) => state.locale);
    const siteId = card.site_id;
    const accountId = account.account_id;

    // Mutations specific to this account
    const createProjected = useCreateSiteChannelKey(siteId, accountId);
    const updateModelDisabled = useUpdateSiteChannelModelDisabled();
    const enableChannel = useEnableChannel();

    const [togglingChannelIds, setTogglingChannelIds] = useState<Set<number>>(new Set());
    const [togglingModelKeys, setTogglingModelKeys] = useState<Set<string>>(new Set());

    const handleCreateProjected = useCallback(
        async (group: SiteChannelGroup) => {
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
        [createProjected, locale]
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
            const modelKey = `${group.group_key}:${modelName}`;
            setTogglingModelKeys((prev) => new Set(prev).add(modelKey));

            try {
                await updateModelDisabled.mutateAsync({
                    siteId,
                    accountId,
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
        [siteId, accountId, updateModelDisabled, locale]
    );

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="py-3 px-5 bg-muted/20 border-b border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h4 className="text-xs font-semibold text-foreground">{account.account_name}</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        所属站点: <span className="font-medium text-foreground">{card.site_name}</span> ({card.platform}) | {account.group_count} 分组 | {account.model_count} 模型
                    </p>
                </div>
            </div>
            <div className="p-5">
                {account.groups && account.groups.length > 0 ? (
                    <ChannelGrid
                        groups={account.groups}
                        onEditKeys={(group) => onEditKeys(siteId, accountId, group)}
                        onCreateProjectedChannel={handleCreateProjected}
                        isCreatingProjected={createProjected.isPending}
                        onToggleProjectedChannel={handleToggleProjectedChannel}
                        togglingChannelIds={togglingChannelIds}
                        onEditRoute={(group, model) => onEditRoute(siteId, accountId, group, model)}
                        onToggleModel={handleToggleModel}
                        togglingModelKeys={togglingModelKeys}
                    />
                ) : (
                    <div className="text-xs text-muted-foreground italic py-2">
                        无账号渠道数据，请在站点管理中新增并手动同步账号。
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SiteChannelSection() {
    const locale = useSettingStore((state) => state.locale);
    const { data: cards, isLoading, error } = useSiteChannelList();

    // Selection states for active dialog target
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

    // Mutation triggers (active dialogs bound to top-level state)
    const updateSourceKeys = useUpdateSiteSourceKeys(selectedSiteId ?? 0, selectedAccountId ?? 0);
    const updateModelRoute = useUpdateSiteChannelModelRoutes(selectedSiteId ?? 0, selectedAccountId ?? 0);

    // Dialog states
    const [isKeysOpen, setIsKeysOpen] = useState(false);
    const [activeGroupForKeys, setActiveGroupForKeys] = useState<SiteChannelGroup | null>(null);

    const [isRouteOpen, setIsRouteOpen] = useState(false);
    const [activeGroupForRoute, setActiveGroupForRoute] = useState<SiteChannelGroup | null>(null);
    const [activeModelForRoute, setActiveModelForRoute] = useState<SiteChannelModel | null>(null);

    // Jump handling
    const pendingJump = useJumpStore((state) => state.pending);
    const clearPending = useJumpStore((state) => state.clearPending);

    useEffect(() => {
        if (pendingJump && isSiteChannelJumpTarget(pendingJump.target)) {
            if (pendingJump.target.kind === 'site-channel-model') {
                const { groupKey, modelName } = pendingJump.target;
                setTimeout(() => {
                    const el = document.getElementById(`model-row-${groupKey}-${modelName}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el?.classList.add('bg-primary/10');
                    setTimeout(() => el?.classList.remove('bg-primary/10'), 2000);
                }, 500);
            }
            clearPending(pendingJump.requestId);
        }
    }, [pendingJump, clearPending]);

    // Dialog callbacks
    const handleEditKeys = useCallback((siteId: number, accountId: number, group: SiteChannelGroup) => {
        setSelectedSiteId(siteId);
        setSelectedAccountId(accountId);
        setActiveGroupForKeys(group);
        setIsKeysOpen(true);
    }, []);

    const handleEditRoute = useCallback((siteId: number, accountId: number, group: SiteChannelGroup, model: SiteChannelModel) => {
        setSelectedSiteId(siteId);
        setSelectedAccountId(accountId);
        setActiveGroupForRoute(group);
        setActiveModelForRoute(model);
        setIsRouteOpen(true);
    }, []);

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
        <div className="flex flex-col gap-8">
            {cards.map((card) => (
                <div key={card.site_id} className="space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2">
                        <Globe2 className="size-4 text-muted-foreground" />
                        <h3 className="text-xs font-semibold">{card.site_name}</h3>
                        <Badge variant="outline" className="text-[10px] py-0 h-5">
                            {card.platform}
                        </Badge>
                    </div>
                    <div className="grid gap-6 grid-cols-1">
                        {card.accounts.map((account) => (
                            <AccountChannelSection
                                key={account.account_id}
                                card={card}
                                account={account}
                                onEditKeys={handleEditKeys}
                                onEditRoute={handleEditRoute}
                            />
                        ))}
                    </div>
                </div>
            ))}

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
