'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, RefreshCw, Search, Radio } from 'lucide-react';
import {
    type Channel,
    type CreateChannelRequest,
    type UpdateChannelRequest,
    useChannelList,
    useCreateChannel,
    useUpdateChannel,
    useDeleteChannel,
    useEnableChannel,
    useSyncChannel
} from '@/api/endpoints/channel';
import { useJumpStore, isSiteChannelJumpTarget } from '@/stores/jump';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent
} from '@/components/ui/tabs';
import { ChannelTable } from './ChannelTable';
import { ChannelFormDialog } from './ChannelFormDialog';
import SiteChannelSection from './site-channel';

export function Channel() {
    const t = useTranslations() as unknown as (key: string, values?: Record<string, string | number>) => string;
    const { data: channels, isLoading, error } = useChannelList();

    // Mutations
    const createChannel = useCreateChannel();
    const updateChannel = useUpdateChannel();
    const deleteChannel = useDeleteChannel();
    const enableChannel = useEnableChannel();
    const syncChannel = useSyncChannel();

    // UI state
    const [activeTab, setActiveTab] = useState<'site' | 'manual'>('site');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

    // Dialog state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
    const [togglingChannelIds, setTogglingChannelIds] = useState<Set<number>>(new Set());

    // Jump handling
    const pendingJump = useJumpStore((state) => state.pending);

    useEffect(() => {
        if (pendingJump) {
            if (pendingJump.target.kind === 'channel-card') {
                setActiveTab('manual');
                const channelId = pendingJump.target.channelId;
                setTimeout(() => {
                    const el = document.getElementById(`channel-row-${channelId}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el?.classList.add('bg-primary/10');
                    setTimeout(() => el?.classList.remove('bg-primary/10'), 2000);
                }, 300);
            } else if (isSiteChannelJumpTarget(pendingJump.target)) {
                setActiveTab('site');
            }
        }
    }, [pendingJump]);

    // Filtered manual channels
    const visibleManualChannels = useMemo(() => {
        if (!channels) return [];
        return channels.filter(({ raw: ch }) => {
            // Must be manual channel (not managed by site)
            if (ch.managed) return false;

            const matchesSearch = !searchTerm.trim() || ch.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'enabled' && ch.enabled) ||
                (statusFilter === 'disabled' && !ch.enabled);

            return matchesSearch && matchesStatus;
        });
    }, [channels, searchTerm, statusFilter]);

    // Handlers
    const handleSyncChannels = useCallback(() => {
        toast.promise(syncChannel.mutateAsync(), {
            loading: '正在同步普通渠道...',
            success: '渠道同步已触发',
            error: (err) => `同步失败: ${err instanceof Error ? err.message : String(err)}`
        });
    }, [syncChannel]);

    const handleToggleChannel = useCallback(
        async (channelId: number, enabled: boolean) => {
            setTogglingChannelIds((prev) => new Set(prev).add(channelId));
            try {
                await enableChannel.mutateAsync({ id: channelId, enabled });
                toast.success('渠道状态已更新');
            } catch (err) {
                toast.error(`更新渠道失败: ${err instanceof Error ? err.message : String(err)}`);
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

    const handleEditChannel = useCallback((channel: Channel) => {
        setEditingChannel(channel);
        setIsFormOpen(true);
    }, []);

    const handleDeleteChannel = useCallback(
        (id: number) => {
            if (!confirm('确定要删除此渠道吗？')) return;
            toast.promise(deleteChannel.mutateAsync(id), {
                loading: '正在删除渠道...',
                success: '渠道已删除',
                error: (err) => `删除失败: ${err instanceof Error ? err.message : String(err)}`
            });
        },
        [deleteChannel]
    );

    const handleSaveChannel = useCallback(
        async (payload: CreateChannelRequest | UpdateChannelRequest) => {
            try {
                if (editingChannel) {
                    await updateChannel.mutateAsync(payload as UpdateChannelRequest);
                    toast.success('渠道更新成功');
                } else {
                    await createChannel.mutateAsync(payload as CreateChannelRequest);
                    toast.success('渠道创建成功');
                }
                setIsFormOpen(false);
            } catch (err) {
                toast.error(`保存渠道失败: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [editingChannel, createChannel, updateChannel]
    );

    return (
        <div className="flex flex-col gap-6 p-6 h-full min-h-0">
            <PageHeader
                title={t('channel.form.model')}
                description={t('stubs.description.channel')}
                actions={
                    activeTab === 'manual' ? (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg h-9 text-xs"
                                onClick={handleSyncChannels}
                                disabled={syncChannel.isPending}
                            >
                                <RefreshCw className="size-3.5 mr-1.5" />
                                同步渠道
                            </Button>
                            <Button
                                size="sm"
                                className="rounded-lg h-9 text-xs"
                                onClick={() => {
                                    setEditingChannel(null);
                                    setIsFormOpen(true);
                                }}
                            >
                                <Plus className="size-3.5 mr-1.5" />
                                新建渠道
                            </Button>
                        </div>
                    ) : null
                }
            />

            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'site' | 'manual')} className="w-full">
                <TabsList className="grid grid-cols-2 w-full max-w-[400px] h-9 p-1 rounded-xl mb-4 bg-muted/40 border">
                    <TabsTrigger value="site" className="text-xs rounded-lg py-1.5">托管渠道</TabsTrigger>
                    <TabsTrigger value="manual" className="text-xs rounded-lg py-1.5">普通渠道</TabsTrigger>
                </TabsList>

                <TabsContent value="site" className="mt-0 focus-visible:outline-none">
                    <SiteChannelSection />
                </TabsContent>

                <TabsContent value="manual" className="mt-0 space-y-4 focus-visible:outline-none">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜索渠道名称..."
                                className="pl-9 h-9 rounded-lg text-xs"
                            />
                        </div>

                        <div className="w-40 text-xs">
                            <Select
                                value={statusFilter}
                                onValueChange={(val) => setStatusFilter(val as 'all' | 'enabled' | 'disabled')}
                            >
                                <SelectTrigger className="h-9 rounded-lg text-xs bg-background">
                                    <SelectValue placeholder="筛选状态" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">全部状态</SelectItem>
                                    <SelectItem value="enabled" className="text-xs">仅启用</SelectItem>
                                    <SelectItem value="disabled" className="text-xs">仅禁用</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">
                            正在加载渠道列表...
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive flex items-center gap-3">
                            <Radio className="size-5 shrink-0" />
                            <div>
                                <div className="font-semibold">加载渠道失败</div>
                                <div className="text-xs text-destructive/80 mt-1">{error.message}</div>
                            </div>
                        </div>
                    ) : (
                        <ChannelTable
                            channels={visibleManualChannels}
                            onEdit={handleEditChannel}
                            onDelete={handleDeleteChannel}
                            onToggle={handleToggleChannel}
                            togglingIds={togglingChannelIds}
                        />
                    )}
                </TabsContent>
            </Tabs>

            <ChannelFormDialog
                open={isFormOpen}
                onOpenChange={setIsFormOpen}
                editingChannel={editingChannel}
                onSave={handleSaveChannel}
                isSaving={createChannel.isPending || updateChannel.isPending}
            />
        </div>
    );
}
export default Channel;
