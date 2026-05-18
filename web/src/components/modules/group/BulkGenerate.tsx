'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Layers3, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    type GroupAutoGenerateAssociationMode,
    type GroupAutoGeneratePreviewItem,
    GroupMode,
    useAutoGenerateGroups,
    usePreviewAutoGenerateGroups,
} from '@/api/endpoints/group';
import { type LLMChannel, useModelChannelList } from '@/api/endpoints/model';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import { getModelIcon } from '@/lib/model-icons';
import { MODE_LABELS } from './utils';

type GenerateScope = 'all' | 'selected';

const ALL_FILTER_VALUE = 'all';
const MANUAL_SITE_FILTER_VALUE = 'manual';

function itemStatus(item: GroupAutoGeneratePreviewItem) {
    if (item.will_create) return 'create';
    if (item.will_add_count > 0) return 'fill';
    return 'skip';
}

function normalizedModelName(value: string) {
    return value.trim().toLowerCase();
}

function previewItemModelKeys(item: GroupAutoGeneratePreviewItem) {
    const keys = new Set<string>();
    keys.add(normalizedModelName(item.model_name));
    item.aliases?.forEach((alias) => {
        const key = normalizedModelName(alias);
        if (key) keys.add(key);
    });
    keys.delete('');
    return Array.from(keys);
}

function previewItemSources(item: GroupAutoGeneratePreviewItem, sourcesByModel: Map<string, LLMChannel[]>) {
    const result: LLMChannel[] = [];
    const seen = new Set<string>();
    previewItemModelKeys(item).forEach((key) => {
        const sources = sourcesByModel.get(key) ?? [];
        sources.forEach((source) => {
            const sourceKey = `${source.channel_id}\x00${source.name}`;
            if (seen.has(sourceKey)) return;
            seen.add(sourceKey);
            result.push(source);
        });
    });
    return result;
}

function previewItemAliasLabels(item: GroupAutoGeneratePreviewItem) {
    const modelKey = normalizedModelName(item.model_name);
    return (item.aliases ?? []).filter((alias) => normalizedModelName(alias) !== modelKey);
}

function modelSourceLabel(source: LLMChannel) {
    const siteParts = [source.site_name, source.site_account_name, source.site_group_name]
        .map((value) => value?.trim())
        .filter(Boolean);
    if (siteParts.length > 0) {
        return `${siteParts.join(' / ')} · ${source.channel_name}`;
    }
    return source.channel_name;
}

export function GroupBulkGenerateDialog() {
    const t = useTranslations('group');
    const bulkT = useTranslations('group.bulk');
    const [open, setOpen] = useState(false);
    const [scope, setScope] = useState<GenerateScope>('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<GroupMode>(GroupMode.RoundRobin);
    const [associationMode, setAssociationMode] = useState<GroupAutoGenerateAssociationMode>('exact');
    const [siteFilter, setSiteFilter] = useState(ALL_FILTER_VALUE);
    const [channelFilter, setChannelFilter] = useState(ALL_FILTER_VALUE);

    const { data: modelChannels = [] } = useModelChannelList();
    const preview = usePreviewAutoGenerateGroups();
    const generate = useAutoGenerateGroups();

    useEffect(() => {
        if (open) {
            preview.mutate({ all: true, association_mode: associationMode });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, associationMode]);

    const previewData = preview.data;
    const items = useMemo(() => previewData?.items ?? [], [previewData]);
    const sourcesByModel = useMemo(() => {
        const result = new Map<string, LLMChannel[]>();
        const seen = new Set<string>();
        modelChannels
            .filter((source) => source.enabled)
            .forEach((source) => {
                const modelKey = normalizedModelName(source.name);
                if (!modelKey || !source.channel_id) return;
                const sourceKey = `${modelKey}\x00${source.channel_id}`;
                if (seen.has(sourceKey)) return;
                seen.add(sourceKey);
                const list = result.get(modelKey) ?? [];
                list.push(source);
                result.set(modelKey, list);
            });
        for (const list of result.values()) {
            list.sort((a, b) => {
                if (a.channel_id === b.channel_id) return a.name.localeCompare(b.name);
                return a.channel_id - b.channel_id;
            });
        }
        return result;
    }, [modelChannels]);
    const siteFilterOptions = useMemo(() => {
        const byValue = new Map<string, string>();
        let hasManualChannel = false;
        modelChannels
            .filter((source) => source.enabled)
            .forEach((source) => {
                if (source.site_id == null) {
                    hasManualChannel = true;
                    return;
                }
                byValue.set(`site:${source.site_id}`, source.site_name?.trim() || `Site #${source.site_id}`);
            });
        const options = Array.from(byValue, ([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
        if (hasManualChannel) {
            options.unshift({ value: MANUAL_SITE_FILTER_VALUE, label: bulkT('filters.manualChannels') });
        }
        return options;
    }, [bulkT, modelChannels]);
    const channelFilterOptions = useMemo(() => {
        const byValue = new Map<string, string>();
        modelChannels
            .filter((source) => source.enabled)
            .forEach((source) => {
                if (!source.channel_id) return;
                byValue.set(`channel:${source.channel_id}`, source.channel_name?.trim() || `Channel #${source.channel_id}`);
            });
        return Array.from(byValue, ([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [modelChannels]);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            if (normalizedQuery && !previewItemModelKeys(item).some((key) => key.includes(normalizedQuery))) return false;
            if (siteFilter === ALL_FILTER_VALUE && channelFilter === ALL_FILTER_VALUE) return true;

            const sources = previewItemSources(item, sourcesByModel);
            return sources.some((source) => {
                const siteMatches = siteFilter === ALL_FILTER_VALUE
                    || (siteFilter === MANUAL_SITE_FILTER_VALUE && source.site_id == null)
                    || siteFilter === `site:${source.site_id}`;
                const channelMatches = channelFilter === ALL_FILTER_VALUE
                    || channelFilter === `channel:${source.channel_id}`;
                return siteMatches && channelMatches;
            });
        });
    }, [channelFilter, items, normalizedQuery, siteFilter, sourcesByModel]);

    const selectedItems = useMemo(
        () => items.filter((item) => selected.has(item.model_name)),
        [items, selected]
    );
    const activeItems = scope === 'all' ? items : selectedItems;
    const activeWillCreate = activeItems.filter((item) => item.will_create).length;
    const activeWillFill = activeItems.filter((item) => !item.will_create && item.will_add_count > 0).length;
    const activeWillAdd = activeItems.reduce((sum, item) => sum + item.will_add_count, 0);

    const toggleSelected = (modelName: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(modelName)) next.delete(modelName);
            else next.add(modelName);
            return next;
        });
    };

    const selectFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            filteredItems.forEach((item) => next.add(item.model_name));
            return next;
        });
    };

    const invertFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            filteredItems.forEach((item) => {
                if (next.has(item.model_name)) next.delete(item.model_name);
                else next.add(item.model_name);
            });
            return next;
        });
    };

    const clearSelected = () => setSelected(new Set());

    const handleGenerate = () => {
        if (scope === 'selected' && selectedItems.length === 0) return;
        generate.mutate(
            {
                all: scope === 'all',
                model_names: scope === 'selected' ? selectedItems.map((item) => item.model_name) : undefined,
                mode,
                association_mode: associationMode,
            },
            {
                onSuccess: (result) => {
                    toast.success(bulkT('toast.generated', {
                        created: result.created_groups,
                        updated: result.updated_groups,
                        added: result.added_items,
                    }));
                    preview.mutate({ all: true, association_mode: associationMode });
                },
                onError: (error) => {
                    toast.error(bulkT('toast.failed'), { description: error.message });
                },
            }
        );
    };

    const canGenerate = scope === 'all' ? items.length > 0 : selectedItems.length > 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="secondary" className="h-9 rounded-xl gap-2">
                    <Sparkles className="size-4" />
                    {bulkT('trigger')}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex h-[min(88vh,46rem)] max-w-[min(94vw,54rem)] flex-col overflow-hidden rounded-3xl p-0">
                <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Layers3 className="size-5" />
                        {bulkT('title')}
                    </DialogTitle>
                    <DialogDescription>{bulkT('description')}</DialogDescription>
                </DialogHeader>

                <div className="grid shrink-0 gap-3 border-b border-border bg-muted/20 px-5 py-4 md:grid-cols-[1fr_auto]">
                    <div className="flex flex-wrap items-center gap-2">
                        {(['all', 'selected'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setScope(value)}
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                                    scope === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                )}
                            >
                                {bulkT(`scope.${value}`)}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        {([GroupMode.RoundRobin, GroupMode.Random, GroupMode.Failover, GroupMode.Weighted] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setMode(value)}
                                className={cn(
                                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                    mode === value ? 'bg-primary/90 text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                {t(`mode.${MODE_LABELS[value]}`)}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 md:col-span-2">
                        {(['exact', 'alias'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    setAssociationMode(value);
                                    setSelected(new Set());
                                }}
                                className={cn(
                                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                    associationMode === value ? 'bg-primary/90 text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                {bulkT(`association.${value}`)}
                            </button>
                        ))}
                        <span className="text-xs text-muted-foreground">{bulkT(`associationHint.${associationMode}`)}</span>
                    </div>
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3 md:col-span-2">
                        <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <div className="font-medium text-foreground">{activeItems.length}</div>
                            <div>{bulkT('summary.models')}</div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <div className="font-medium text-foreground">{activeWillCreate} / {activeWillFill}</div>
                            <div>{bulkT('summary.createFill')}</div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <div className="font-medium text-foreground">{activeWillAdd}</div>
                            <div>{bulkT('summary.items')}</div>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="relative min-w-48 flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={bulkT('searchPlaceholder')}
                                className="h-9 rounded-xl pl-8"
                            />
                        </div>
                        <Button type="button" variant="secondary" className="h-9 rounded-xl" onClick={() => preview.mutate({ all: true, association_mode: associationMode })} disabled={preview.isPending}>
                            <RefreshCw className={cn('size-4', preview.isPending && 'animate-spin')} />
                            {bulkT('refresh')}
                        </Button>
                        <Select value={siteFilter} onValueChange={setSiteFilter}>
                            <SelectTrigger className="h-9 min-w-36 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_FILTER_VALUE} className="rounded-xl">
                                    {bulkT('filters.allSites')}
                                </SelectItem>
                                {siteFilterOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value} className="rounded-xl">
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={channelFilter} onValueChange={setChannelFilter}>
                            <SelectTrigger className="h-9 min-w-40 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_FILTER_VALUE} className="rounded-xl">
                                    {bulkT('filters.allChannels')}
                                </SelectItem>
                                {channelFilterOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value} className="rounded-xl">
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {scope === 'selected' && (
                            <>
                                <Button type="button" variant="secondary" className="h-9 rounded-xl" onClick={selectFiltered} disabled={filteredItems.length === 0}>
                                    {bulkT('selectFiltered')}
                                </Button>
                                <Button type="button" variant="secondary" className="h-9 rounded-xl" onClick={invertFiltered} disabled={filteredItems.length === 0}>
                                    {bulkT('invertFiltered')}
                                </Button>
                                <Button type="button" variant="secondary" className="h-9 rounded-xl" onClick={clearSelected} disabled={selected.size === 0}>
                                    {bulkT('clearSelected')}
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2">
                        {preview.isPending ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                {bulkT('loading')}
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                {bulkT('empty')}
                            </div>
                        ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                                {filteredItems.map((item) => {
                                    const selectedItem = selected.has(item.model_name);
                                    const status = itemStatus(item);
                                    const { Avatar } = getModelIcon(item.model_name);
                                    const sources = previewItemSources(item, sourcesByModel);
                                    const sourcePreview = sources.slice(0, 2).map(modelSourceLabel).join(' · ');
                                    const sourceOverflow = sources.length > 2 ? sources.length - 2 : 0;
                                    const aliases = previewItemAliasLabels(item);
                                    const aliasPreview = aliases.slice(0, 2).join(' / ');
                                    const aliasOverflow = aliases.length > 2 ? aliases.length - 2 : 0;
                                    return (
                                        <button
                                            key={item.model_name}
                                            type="button"
                                            onClick={() => scope === 'selected' && toggleSelected(item.model_name)}
                                            className={cn(
                                                'flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors',
                                                scope === 'selected' ? 'hover:bg-muted' : 'cursor-default',
                                                selectedItem && scope === 'selected' && 'border-primary/60 bg-primary/5'
                                            )}
                                        >
                                            <span className="shrink-0">
                                                <Avatar size={18} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium">{item.model_name}</span>
                                                <span className="block truncate text-[11px] text-muted-foreground">
                                                    {bulkT('row.candidates', { count: item.candidate_count })}
                                                    {' · '}
                                                    {status === 'create'
                                                        ? bulkT('row.create')
                                                        : status === 'fill'
                                                            ? bulkT('row.fill', { count: item.will_add_count })
                                                            : bulkT('row.skip')}
                                                </span>
                                                {sourcePreview && (
                                                    <span className="block truncate text-[10px] text-muted-foreground/80">
                                                        {sourcePreview}
                                                        {sourceOverflow > 0 ? ` +${sourceOverflow}` : ''}
                                                    </span>
                                                )}
                                                {aliases.length > 0 && (
                                                    <span className="block truncate text-[10px] text-muted-foreground/80">
                                                        {bulkT('row.aliases', {
                                                            aliases: `${aliasPreview}${aliasOverflow > 0 ? ` +${aliasOverflow}` : ''}`,
                                                        })}
                                                    </span>
                                                )}
                                            </span>
                                            {scope === 'selected' && (
                                                <span className={cn(
                                                    'grid size-5 shrink-0 place-items-center rounded border border-border text-background',
                                                    selectedItem && 'border-primary bg-primary text-primary-foreground'
                                                )}>
                                                    {selectedItem && <Check className="size-3.5" />}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
                    <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setOpen(false)}>
                        {bulkT('close')}
                    </Button>
                    <Button type="button" className="rounded-xl" onClick={handleGenerate} disabled={!canGenerate || generate.isPending || preview.isPending}>
                        {generate.isPending && <Loader2 className="size-4 animate-spin" />}
                        {generate.isPending ? bulkT('generating') : bulkT('generate')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
