'use client';

import { useState, useMemo, useCallback } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type Group, useDeleteGroup, useUpdateGroup, type GroupUpdateRequest } from '@/api/endpoints/group';
import { useModelChannelList } from '@/api/endpoints/model';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CopyButton } from '@/components/shared/copy-button';
import { GroupEditor, type GroupEditorValues } from './group-editor';
import { GroupHealthBadge } from './group-health';
import { GroupRoutingBadge } from './group-routing';
import { modelChannelKey, MODE_LABELS } from './group-utils';
import { type SelectedMember } from './member-list';

interface GroupCardProps {
    group: Group;
}

export function GroupCard({ group }: GroupCardProps) {
    const t = useTranslations('group');
    const updateGroup = useUpdateGroup();
    const deleteGroup = useDeleteGroup();
    const { data: modelChannels = [] } = useModelChannelList();

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const modelChannelByKey = useMemo(() => {
        const map = new Map<string, typeof modelChannels[number]>();
        modelChannels.forEach((mc) => {
            map.set(modelChannelKey(mc.channel_id, mc.name), mc);
        });
        return map;
    }, [modelChannels]);

    const displayMembers = useMemo((): SelectedMember[] =>
        [...(group.items || [])]
            .sort((a, b) => a.priority - b.priority)
            .map((item) => {
                const key = modelChannelKey(item.channel_id, item.model_name);
                const modelChannel = modelChannelByKey.get(key);
                return {
                    ...modelChannel,
                    id: key,
                    name: item.model_name,
                    enabled: modelChannel?.enabled ?? true,
                    channel_id: item.channel_id,
                    channel_name: modelChannel?.channel_name ?? `Channel ${item.channel_id}`,
                    item_id: item.id,
                    weight: item.weight,
                };
            }),
        [group.items, modelChannelByKey]
    );

    const handleDelete = () => {
        if (!group.id) return;
        toast.promise(deleteGroup.mutateAsync(group.id), {
            loading: '正在删除分组...',
            success: '分组已成功删除',
            error: '删除失败'
        });
        setConfirmDelete(false);
    };

    const handleSubmitEdit = useCallback((values: GroupEditorValues) => {
        if (!group.id) return;

        const originalItems = [...(group.items || [])].sort((a, b) => a.priority - b.priority);
        const originalById = new Map<number, { priority: number; weight: number }>();
        const originalIds = new Set<number>();
        originalItems.forEach((it) => {
            if (typeof it.id === 'number') {
                originalIds.add(it.id);
                originalById.set(it.id, { priority: it.priority, weight: it.weight });
            }
        });

        const newIds = new Set<number>();
        values.members.forEach((m) => { if (typeof m.item_id === 'number') newIds.add(m.item_id); });

        const items_to_delete = Array.from(originalIds).filter((id) => !newIds.has(id));

        const items_to_add = values.members
            .map((m, idx) => ({ m, priority: idx + 1 }))
            .filter(({ m }) => typeof m.item_id !== 'number')
            .map(({ m, priority }) => ({
                channel_id: m.channel_id,
                model_name: m.name,
                priority,
                weight: m.weight ?? 1,
            }));

        const items_to_update = values.members
            .map((m, idx) => ({ m, priority: idx + 1 }))
            .filter(({ m }) => typeof m.item_id === 'number')
            .map(({ m, priority }) => {
                const id = m.item_id!;
                const orig = originalById.get(id);
                const weight = m.weight ?? 1;
                if (!orig) return null;
                if (orig.priority === priority && orig.weight === weight) return null;
                return { id, priority, weight };
            })
            .filter((x): x is { id: number; priority: number; weight: number } => x !== null);

        const payload: GroupUpdateRequest = { id: group.id! };
        const nextName = values.name.trim();
        const nextRegex = (values.match_regex ?? '').trim();
        const nextFirstTokenTimeOut = values.first_token_time_out ?? 0;
        const nextSessionKeepTime = values.session_keep_time ?? 0;

        if (nextName && nextName !== group.name) payload.name = nextName;
        if (values.mode !== group.mode) payload.mode = values.mode;
        if (nextRegex !== (group.match_regex ?? '')) payload.match_regex = nextRegex;
        if (nextFirstTokenTimeOut !== (group.first_token_time_out ?? 0)) payload.first_token_time_out = nextFirstTokenTimeOut;
        if (nextSessionKeepTime !== (group.session_keep_time ?? 0)) payload.session_keep_time = nextSessionKeepTime;
        if (values.retry_enabled !== (group.retry_enabled ?? false)) payload.retry_enabled = values.retry_enabled;
        if (values.max_retries !== (group.max_retries ?? 3)) payload.max_retries = values.max_retries;
        if (items_to_add.length) payload.items_to_add = items_to_add;
        if (items_to_update.length) payload.items_to_update = items_to_update;
        if (items_to_delete.length) payload.items_to_delete = items_to_delete;

        if (Object.keys(payload).length === 1) {
            setIsEditDialogOpen(false);
            return;
        }

        toast.promise(updateGroup.mutateAsync(payload), {
            loading: '正在保存分组...',
            success: () => {
                setIsEditDialogOpen(false);
                return '分组已成功保存';
            },
            error: '保存失败'
        });
    }, [group.first_token_time_out, group.session_keep_time, group.retry_enabled, group.max_retries, group.id, group.items, group.match_regex, group.mode, group.name, updateGroup]);

    return (
        <article className="border border-border bg-card text-card-foreground rounded-xl flex flex-col p-4 transition-all hover:bg-muted/10 h-full relative">
            <header className="flex items-start justify-between mb-3 min-w-0">
                <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <h3 className="text-sm font-bold truncate text-foreground/90">{group.name}</h3>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">{group.name}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <CopyButton value={group.name} className="h-5 w-5 text-muted-foreground/60 hover:text-foreground" />
                    </div>
                    <div className="mt-1">
                        <Badge variant="secondary" className="rounded-md h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider">
                            {t(`mode.${MODE_LABELS[group.mode]}`)}
                        </Badge>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                                <Pencil className="size-3.5" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[min(94vw,52rem)] h-[calc(100vh-4rem)] flex flex-col rounded-2xl p-4">
                            <DialogHeader>
                                <DialogTitle className="text-sm font-semibold">编辑模型分组</DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 min-h-0">
                                <GroupEditor
                                    initial={{
                                        name: group.name,
                                        match_regex: group.match_regex ?? '',
                                        mode: group.mode,
                                        first_token_time_out: group.first_token_time_out ?? 0,
                                        session_keep_time: group.session_keep_time ?? 0,
                                        retry_enabled: group.retry_enabled ?? false,
                                        max_retries: group.max_retries ?? 3,
                                        members: displayMembers,
                                    }}
                                    submitText="保存"
                                    submittingText="正在保存..."
                                    isSubmitting={updateGroup.isPending}
                                    onCancel={() => setIsEditDialogOpen(false)}
                                    onSubmit={handleSubmitEdit}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>

                    {!confirmDelete ? (
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="size-3.5" />
                        </Button>
                    ) : (
                        <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/20 rounded-lg p-0.5 animate-none">
                            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(false)} className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-transparent">
                                <X className="size-3" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={handleDelete} className="h-6 w-6 rounded-md text-destructive hover:text-destructive hover:bg-transparent">
                                <Trash2 className="size-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            <div className="my-2 border-t border-border/20 pt-2 flex flex-col gap-1.5 flex-1">
                <GroupRoutingBadge groupId={group.id} />
                <GroupHealthBadge groupId={group.id} />
            </div>

            <footer className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-semibold border-t border-border/20 pt-2 shrink-0">
                <span>重试: {group.retry_enabled ? `${group.max_retries ?? 3}x` : '关闭'}</span>
                <span>候选模型数: {displayMembers.length}</span>
            </footer>
        </article>
    );
}
