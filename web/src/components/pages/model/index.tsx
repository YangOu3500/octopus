'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    useModelList,
    useUpdateModel,
    useDeleteModel,
    useCreateModel,
    type LLMInfo
} from '@/api/endpoints/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getModelIcon } from '@/lib/model-icons';
import { PageHeader } from '@/components/shared/page-header';
import { ModelForm, type ModelFormState } from './model-form';

function sourceTone(source: LLMInfo['resolved_source']) {
    switch (source) {
        case 'upstream':
            return 'border-primary/20 bg-primary/10 text-primary';
        case 'official':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'manual':
            return 'border-border bg-background text-muted-foreground';
        case 'manual_required':
        default:
            return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }
}

const SOURCE_FLOW = ['upstream', 'official', 'manual'] as const;

export function Model() {
    const t = useTranslations('model');
    const { data: models, isLoading, error } = useModelList();
    const updateModel = useUpdateModel();
    const deleteModel = useDeleteModel();
    const createModel = useCreateModel();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'priced' | 'free'>('all');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<LLMInfo | null>(null);
    const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);

    const sortedModels = useMemo(() => {
        if (!models) return [];
        return [...models].sort((a, b) => a.name.localeCompare(b.name));
    }, [models]);

    const visibleModels = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        const byName = !term ? sortedModels : sortedModels.filter((m) => m.name.toLowerCase().includes(term));
        const hasPricing = (m: LLMInfo) => m.input + m.output + m.cache_read + m.cache_write > 0;

        if (filterMode === 'priced') return byName.filter(hasPricing);
        if (filterMode === 'free') return byName.filter((m) => !hasPricing(m));
        return byName;
    }, [sortedModels, searchTerm, filterMode]);

    const handleCreate = (values: ModelFormState) => {
        toast.promise(
            createModel.mutateAsync({
                name: values.name.trim(),
                input: parseFloat(values.input) || 0,
                output: parseFloat(values.output) || 0,
                cache_read: parseFloat(values.cache_read) || 0,
                cache_write: parseFloat(values.cache_write) || 0,
            }),
            {
                loading: '正在添加模型价格...',
                success: () => {
                    setIsCreateOpen(false);
                    return '添加模型价格成功';
                },
                error: '添加失败'
            }
        );
    };

    const handleUpdate = (values: ModelFormState) => {
        if (!editingModel) return;
        toast.promise(
            updateModel.mutateAsync({
                name: editingModel.name,
                input: parseFloat(values.input) || 0,
                output: parseFloat(values.output) || 0,
                cache_read: parseFloat(values.cache_read) || 0,
                cache_write: parseFloat(values.cache_write) || 0,
            }),
            {
                loading: '正在保存模型价格...',
                success: () => {
                    setEditingModel(null);
                    return '修改模型价格成功';
                },
                error: '保存失败'
            }
        );
    };

    const handleDelete = (name: string) => {
        toast.promise(deleteModel.mutateAsync(name), {
            loading: '正在删除模型价格...',
            success: () => {
                setConfirmDeleteName(null);
                return '模型价格已删除';
            },
            error: '删除失败'
        });
    };

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="模型价格"
                description="配置模型的输入输出价格，支持缓存读取和写入单价计算"
                actions={
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="h-9 rounded-xl gap-2 font-semibold">
                                <Plus className="size-4" />
                                添加自定义价格
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md rounded-2xl p-4">
                            <DialogHeader>
                                <DialogTitle className="text-sm font-semibold">添加模型价格配置</DialogTitle>
                            </DialogHeader>
                            <ModelForm
                                isPending={createModel.isPending}
                                isEdit={false}
                                onSubmit={handleCreate}
                                onCancel={() => setIsCreateOpen(false)}
                            />
                        </DialogContent>
                    </Dialog>
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="搜索模型名称..."
                        className="pl-9 h-9 rounded-lg text-xs"
                    />
                </div>

                <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/20">
                    {(['all', 'priced', 'free'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setFilterMode(m)}
                            className={cn(
                                'px-2.5 py-1 text-xs rounded-md transition-colors',
                                filterMode === m ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {m === 'all' ? '全部' : m === 'priced' ? '已定价' : '免费'}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="py-20 text-center text-muted-foreground animate-pulse font-semibold">
                    正在加载价格信息...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-destructive flex items-center gap-3">
                    <div>
                        <div className="font-semibold">加载失败</div>
                        <div className="text-[11px] text-destructive/80 mt-1">{error.message}</div>
                    </div>
                </div>
            ) : visibleModels.length === 0 ? (
                <div className="rounded-xl border border-dashed py-20 text-center text-muted-foreground font-semibold">
                    暂无价格数据。
                </div>
            ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {visibleModels.map((model) => {
                        const { Avatar, color: brandColor } = getModelIcon(model.name);
                        const resolvedSource = model.resolved_source ?? (model.manual_configured ? 'manual' : 'manual_required');
                        const sourceDetail = resolvedSource === 'upstream'
                            ? t('sourceMeta.upstream', { accounts: model.upstream_site_accounts ?? 0, groups: model.upstream_groups ?? 0 })
                            : resolvedSource === 'official'
                                ? (model.resolved_updated_at ? t('sourceMeta.officialWithTime', { time: new Date(model.resolved_updated_at).toLocaleString() }) : t('sourceMeta.official'))
                                : resolvedSource === 'manual' ? t('sourceMeta.manual') : t('sourceMeta.manualRequired');

                        return (
                            <article
                                key={model.name}
                                className={cn(
                                    'border border-border bg-card text-card-foreground rounded-xl flex items-start gap-3 p-4 transition-all hover:bg-muted/10',
                                    resolvedSource === 'manual_required' && 'border-amber-500/30 bg-amber-500/[0.04]'
                                )}
                            >
                                <span className="shrink-0 mt-0.5">
                                    <Avatar size={36} />
                                </span>

                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-start justify-between gap-2 min-w-0">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <h3 className="text-sm font-bold truncate text-foreground/90">{model.name}</h3>
                                                </TooltipTrigger>
                                                <TooltipContent className="text-xs">{model.name}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        <Badge variant="outline" className={cn('shrink-0 rounded-md px-1.5 py-0 text-[10px]', sourceTone(resolvedSource))}>
                                            {t(`source.${resolvedSource}`)}
                                        </Badge>
                                    </div>

                                    <p className={cn('text-[10px] leading-tight font-medium', resolvedSource === 'manual_required' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                                        {sourceDetail}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-1 text-[9px] text-muted-foreground">
                                        <span className="mr-0.5">生效路径:</span>
                                        {SOURCE_FLOW.map((source, index) => {
                                            const currentSource = resolvedSource === 'manual_required' ? 'manual' : resolvedSource;
                                            const active = currentSource === source;
                                            return (
                                                <div key={source} className="inline-flex items-center gap-0.5">
                                                    <Badge variant="outline" className={cn('rounded-md px-1 py-0 text-[9px]', active ? sourceTone(resolvedSource) : 'border-border/70 bg-background text-muted-foreground')}>
                                                        {t(`source.${source}`)}
                                                    </Badge>
                                                    {index < SOURCE_FLOW.length - 1 && <ChevronRight className="size-2 text-muted-foreground/60" />}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="pt-1.5 border-t border-border/40 space-y-1 text-xs tabular-nums text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <ArrowDownToLine className="size-3.5" style={{ color: brandColor }} />
                                            <span>输入 / 缓存读:</span>
                                            <span className="font-semibold text-foreground">{model.input.toFixed(2)} / {model.cache_read.toFixed(2)}$</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <ArrowUpFromLine className="size-3.5" style={{ color: brandColor }} />
                                            <span>输出 / 缓存写:</span>
                                            <span className="font-semibold text-foreground">{model.output.toFixed(2)} / {model.cache_write.toFixed(2)}$</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 flex flex-col gap-1.5">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                                        onClick={() => setEditingModel(model)}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>

                                    {confirmDeleteName !== model.name ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setConfirmDeleteName(model.name)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    ) : (
                                        <div className="flex items-center gap-0.5 bg-destructive/10 border border-destructive/20 rounded-lg p-0.5">
                                            <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteName(null)} className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-transparent">
                                                <X className="size-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(model.name)} className="h-6 w-6 rounded-md text-destructive hover:text-destructive hover:bg-transparent">
                                                <Trash2 className="size-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <Dialog open={editingModel !== null} onOpenChange={(open) => !open && setEditingModel(null)}>
                <DialogContent className="max-w-md rounded-2xl p-4">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-semibold">修改模型价格</DialogTitle>
                    </DialogHeader>
                    {editingModel && (
                        <ModelForm
                            initialValues={{
                                name: editingModel.name,
                                input: editingModel.input.toString(),
                                output: editingModel.output.toString(),
                                cache_read: editingModel.cache_read.toString(),
                                cache_write: editingModel.cache_write.toString(),
                            }}
                            isPending={updateModel.isPending}
                            isEdit={true}
                            onSubmit={handleUpdate}
                            onCancel={() => setEditingModel(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
