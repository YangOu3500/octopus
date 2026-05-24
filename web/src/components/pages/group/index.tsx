'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGroupList, useCreateGroup, type GroupItem } from '@/api/endpoints/group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { GroupCard } from './group-card';
import { GroupEditor, type GroupEditorValues } from './group-editor';
import { GroupBulkGenerateDialog } from './bulk-generate';

export function Group() {
    const t = useTranslations('group');
    const { data: groups, isLoading, error } = useGroupList();
    const createGroup = useCreateGroup();

    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const sortedGroups = useMemo(() => {
        if (!groups) return [];
        return [...groups].sort((a, b) => (a.id || 0) - (b.id || 0));
    }, [groups]);

    const visibleGroups = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return sortedGroups;
        return sortedGroups.filter((g) => g.name.toLowerCase().includes(term));
    }, [sortedGroups, searchTerm]);

    const handleCreateGroup = (values: GroupEditorValues) => {
        const items: GroupItem[] = values.members.map((member, index) => ({
            channel_id: member.channel_id,
            model_name: member.name,
            priority: index + 1,
            weight: member.weight ?? 1,
        }));

        toast.promise(
            createGroup.mutateAsync({
                name: values.name,
                mode: values.mode,
                match_regex: values.match_regex ?? '',
                first_token_time_out: values.first_token_time_out ?? 0,
                session_keep_time: values.session_keep_time ?? 0,
                retry_enabled: values.retry_enabled,
                max_retries: values.max_retries,
                items,
            }),
            {
                loading: '正在创建模型分组...',
                success: () => {
                    setIsCreateOpen(false);
                    return '模型分组创建成功';
                },
                error: '创建失败'
            }
        );
    };

    return (
        <div className="flex flex-col gap-4 text-xs">
            <PageHeader
                title="模型分组"
                description="对各个渠道的模型进行分组，提供高可用的调度和健康检查支持"
                actions={
                    <div className="flex items-center gap-2">
                        <GroupBulkGenerateDialog />
                        
                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Button className="h-9 rounded-xl gap-2 font-semibold">
                                    <Plus className="size-4" />
                                    {t('create.title')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[min(94vw,52rem)] h-[calc(100vh-4rem)] flex flex-col rounded-2xl p-4">
                                <DialogHeader>
                                    <DialogTitle className="text-sm font-semibold">创建新模型分组</DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 min-h-0">
                                    <GroupEditor
                                        submitText="创建"
                                        submittingText="正在创建..."
                                        isSubmitting={createGroup.isPending}
                                        onCancel={() => setIsCreateOpen(false)}
                                        onSubmit={handleCreateGroup}
                                    />
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                }
            />

            <div className="relative w-full max-w-sm shrink-0">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索分组名称..."
                    className="pl-9 h-9 rounded-lg text-xs"
                />
            </div>

            {isLoading ? (
                <div className="py-20 text-center text-muted-foreground animate-pulse font-semibold">
                    正在加载模型分组...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-destructive flex items-center gap-3">
                    <div>
                        <div className="font-semibold">加载失败</div>
                        <div className="text-[11px] text-destructive/80 mt-1">{error.message}</div>
                    </div>
                </div>
            ) : visibleGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed py-20 text-center text-muted-foreground font-semibold">
                    暂无符合条件的分组。
                </div>
            ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {visibleGroups.map((group) => (
                        <div key={group.id}>
                            <GroupCard group={group} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
