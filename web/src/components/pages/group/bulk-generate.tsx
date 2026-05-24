'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, Loader2, RefreshCw, Search, Settings2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    type GroupAutoGenerateAssociationOptions,
    type GroupAutoGenerateAssociationMode,
    type GroupAutoGenerateRequest,
    GroupMode,
    useAutoGenerateGroups,
    usePreviewAutoGenerateGroups,
} from '@/api/endpoints/group';
import { type LLMChannel, useModelChannelList } from '@/api/endpoints/model';
import { SettingKey, useSetSetting, useSettingList } from '@/api/endpoints/setting';
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
    ASSOCIATION_OPTION_KEYS,
    associationOptionsEqual,
    createManualAliasDraftFromValue,
    defaultAssociationOptions,
    manualAliasesEqual,
    parseSavedAssociationState,
    sanitizeManualAliases,
    type ManualAliasDraft,
} from '@/lib/group-association';
import { cn } from '@/lib/utils';
import { MODE_LABELS } from './group-utils';
import {
    BulkGenerateList,
    previewItemModelKeys,
    previewItemSources,
} from './bulk-generate-list';

type GenerateScope = 'all' | 'selected';

const ALL_FILTER_VALUE = 'all';
const MANUAL_SITE_FILTER_VALUE = 'manual';

export function GroupBulkGenerateDialog() {
    const t = useTranslations('group');
    const bulkT = useTranslations('group.bulk');
    const [open, setOpen] = useState(false);
    const [scope, setScope] = useState<GenerateScope>('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<GroupMode>(GroupMode.RoundRobin);
    const [associationMode, setAssociationMode] = useState<GroupAutoGenerateAssociationMode>('exact');
    const [associationOptions, setAssociationOptions] = useState<GroupAutoGenerateAssociationOptions>(() => defaultAssociationOptions('exact'));
    const [manualAliases, setManualAliases] = useState<ManualAliasDraft[]>([]);
    const [siteFilter, setSiteFilter] = useState(ALL_FILTER_VALUE);
    const [channelFilter, setChannelFilter] = useState(ALL_FILTER_VALUE);
    const initializedFromSaved = useRef(false);

    const { data: modelChannels = [] } = useModelChannelList();
    const { data: settings = [], isLoading: settingsLoading } = useSettingList();
    const preview = usePreviewAutoGenerateGroups();
    const generate = useAutoGenerateGroups();
    const setSetting = useSetSetting();
    const savedAssociationState = useMemo(() => parseSavedAssociationState(settings), [settings]);
    const normalizedManualAliases = useMemo(() => sanitizeManualAliases(manualAliases), [manualAliases]);
    const previewPayload = useMemo<GroupAutoGenerateRequest>(() => ({
        all: true,
        association_mode: associationMode,
        association_options: associationOptions,
        manual_aliases: normalizedManualAliases.length > 0 ? normalizedManualAliases : undefined,
    }), [associationMode, associationOptions, normalizedManualAliases]);

    useEffect(() => {
        if (!open) {
            initializedFromSaved.current = false;
            return;
        }
        if (settingsLoading || initializedFromSaved.current) return;
        setAssociationMode(savedAssociationState.associationMode);
        setAssociationOptions(savedAssociationState.associationOptions);
        setManualAliases(savedAssociationState.manualAliases.map(createManualAliasDraftFromValue));
        initializedFromSaved.current = true;
    }, [open, savedAssociationState, settingsLoading]);

    useEffect(() => {
        if (!open || settingsLoading) return;
        const timer = window.setTimeout(() => {
            preview.mutate(previewPayload);
        }, 250);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, previewPayload, settingsLoading]);

    const previewData = preview.data;
    const items = useMemo(() => previewData?.items ?? [], [previewData]);
    const sourcesByModel = useMemo(() => {
        const result = new Map<string, LLMChannel[]>();
        const seen = new Set<string>();
        modelChannels
            .filter((source) => source.enabled)
            .forEach((source) => {
                const modelKey = source.name.trim().toLowerCase();
                if (!modelKey || !source.channel_id) return;
                const sourceKey = `${modelKey}\x00${source.channel_id}`;
                if (seen.has(sourceKey)) return;
                seen.add(sourceKey);
                const list = result.get(modelKey) ?? [];
                list.push(source);
                result.set(modelKey, list);
            });
        return result;
    }, [modelChannels]);

    const siteFilterOptions = useMemo(() => {
        const byValue = new Map<string, string>();
        let hasManualChannel = false;
        modelChannels.filter((source) => source.enabled).forEach((source) => {
            if (source.site_id == null) {
                hasManualChannel = true;
                return;
            }
            byValue.set(`site:${source.site_id}`, source.site_name?.trim() || `Site #${source.site_id}`);
        });
        const options = Array.from(byValue, ([value, label]) => ({ value, label }));
        if (hasManualChannel) {
            options.unshift({ value: MANUAL_SITE_FILTER_VALUE, label: bulkT('filters.manualChannels') });
        }
        return options;
    }, [bulkT, modelChannels]);

    const channelFilterOptions = useMemo(() => {
        const byValue = new Map<string, string>();
        modelChannels.filter((source) => source.enabled).forEach((source) => {
            if (!source.channel_id) return;
            byValue.set(`channel:${source.channel_id}`, source.channel_name?.trim() || `Channel #${source.channel_id}`);
        });
        return Array.from(byValue, ([value, label]) => ({ value, label }));
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
    const activeAverageScore = activeItems.length > 0
        ? Math.round(activeItems.reduce((sum, item) => sum + (item.match_score ?? 0), 0) / activeItems.length)
        : 0;

    const currentAssociationMatchesSaved = associationMode === savedAssociationState.associationMode
        && associationOptionsEqual(associationOptions, savedAssociationState.associationOptions)
        && manualAliasesEqual(normalizedManualAliases, savedAssociationState.manualAliases);

    const toggleSelected = (modelName: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(modelName)) next.delete(modelName);
            else next.add(modelName);
            return next;
        });
    };

    const applySavedAssociationRules = () => {
        setAssociationMode(savedAssociationState.associationMode);
        setAssociationOptions(savedAssociationState.associationOptions);
        setManualAliases(savedAssociationState.manualAliases.map(createManualAliasDraftFromValue));
        setSelected(new Set());
    };

    const canGenerate = scope === 'all' ? items.length > 0 : selectedItems.length > 0;

    const handleSaveAssociationRules = async () => {
        try {
            await setSetting.mutateAsync({ key: SettingKey.GroupAutoGenerateAssociationMode, value: associationMode });
            await setSetting.mutateAsync({ key: SettingKey.GroupAutoGenerateAssociationOptions, value: JSON.stringify(associationOptions) });
            await setSetting.mutateAsync({ key: SettingKey.GroupAutoGenerateManualAliases, value: JSON.stringify(normalizedManualAliases) });
            toast.success(bulkT('rules.toast.saved'));
        } catch (error) {
            toast.error(bulkT('rules.toast.saveFailed'), { description: error instanceof Error ? error.message : undefined });
        }
    };

    const handleGenerate = () => {
        if (scope === 'selected' && selectedItems.length === 0) return;
        generate.mutate(
            {
                all: scope === 'all',
                model_names: scope === 'selected' ? selectedItems.map((item) => item.model_name) : undefined,
                mode,
                association_mode: associationMode,
                association_options: associationOptions,
                manual_aliases: normalizedManualAliases.length > 0 ? normalizedManualAliases : undefined,
            },
            {
                onSuccess: (result) => {
                    toast.success(bulkT('toast.generated', {
                        created: result.created_groups,
                        updated: result.updated_groups,
                        added: result.added_items,
                    }));
                    preview.mutate(previewPayload);
                },
                onError: (error) => {
                    toast.error(bulkT('toast.failed'), { description: error.message });
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="secondary" className="h-9 rounded-xl gap-2 font-semibold">
                    <Sparkles className="size-4" />
                    {bulkT('trigger')}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex h-[min(88vh,46rem)] max-w-[min(94vw,54rem)] flex-col overflow-hidden rounded-2xl p-0 text-xs">
                <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                        <Layers3 className="size-5" />
                        {bulkT('title')}
                    </DialogTitle>
                    <DialogDescription className="text-xs">{bulkT('description')}</DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <div className="grid shrink-0 gap-3 border-b border-border bg-muted/20 px-5 py-4 md:grid-cols-[1fr_auto]">
                        <div className="flex flex-wrap items-center gap-2">
                            {(['all', 'selected'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setScope(value)}
                                    className={cn(
                                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border',
                                        scope === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
                                        'rounded-lg px-2 py-1 transition-colors border',
                                        mode === value ? 'bg-primary/90 text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                                    )}
                                >
                                    {t(`mode.${MODE_LABELS[value]}`)}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                            {(['exact', 'alias'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setAssociationMode(value);
                                        setAssociationOptions(defaultAssociationOptions(value));
                                        setSelected(new Set());
                                    }}
                                    className={cn(
                                        'rounded-lg px-2.5 py-1 transition-colors border',
                                        associationMode === value ? 'bg-primary/90 text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                                    )}
                                >
                                    {bulkT(`association.${value}`)}
                                </button>
                            ))}
                            <span className="text-[10px] text-muted-foreground">{bulkT(`associationHint.${associationMode}`)}</span>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background px-3 py-3 md:col-span-2">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                        <Settings2 className="size-4" />
                                        {bulkT('rules.title')}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {bulkT('rules.description')}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2 text-[10px]" onClick={applySavedAssociationRules} disabled={settingsLoading || currentAssociationMatchesSaved}>
                                        {bulkT('rules.loadSaved')}
                                    </Button>
                                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2 text-[10px]" onClick={handleSaveAssociationRules} disabled={setSetting.isPending || currentAssociationMatchesSaved}>
                                        {bulkT('rules.save')}
                                    </Button>
                                </div>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-2">
                                {ASSOCIATION_OPTION_KEYS.map((key) => (
                                    <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-semibold text-foreground">{bulkT(`rules.options.${key}.label`)}</div>
                                            <div className="text-[10px] text-muted-foreground">{bulkT(`rules.options.${key}.help`)}</div>
                                        </div>
                                        <Switch checked={Boolean(associationOptions[key])} onCheckedChange={(checked) => setAssociationOptions(prev => ({ ...prev, [key]: checked }))} className="scale-75" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-4 md:col-span-2">
                            <div className="rounded-lg border border-border/60 bg-background px-3 py-1.5">
                                <div className="font-semibold text-foreground">{activeItems.length}</div>
                                <div>{bulkT('summary.models')}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background px-3 py-1.5">
                                <div className="font-semibold text-foreground">{activeWillCreate} / {activeWillFill}</div>
                                <div>{bulkT('summary.createFill')}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background px-3 py-1.5">
                                <div className="font-semibold text-foreground">{activeWillAdd}</div>
                                <div>{bulkT('summary.items')}</div>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background px-3 py-1.5">
                                <div className="font-semibold text-foreground">{activeAverageScore}</div>
                                <div>{bulkT('summary.score')}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col px-5 py-4 min-h-[300px]">
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
                            <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => preview.mutate(previewPayload)} disabled={preview.isPending}>
                                <RefreshCw className={cn('size-4 mr-1', preview.isPending && 'animate-spin')} />
                                {bulkT('refresh')}
                            </Button>
                            <Select value={siteFilter} onValueChange={setSiteFilter}>
                                <SelectTrigger className="h-9 min-w-32 rounded-xl text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_FILTER_VALUE} className="rounded-xl">所有站点</SelectItem>
                                    {siteFilterOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value} className="rounded-xl">{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={channelFilter} onValueChange={setChannelFilter}>
                                <SelectTrigger className="h-9 min-w-36 rounded-xl text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_FILTER_VALUE} className="rounded-xl">所有渠道</SelectItem>
                                    {channelFilterOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value} className="rounded-xl">{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="mt-3 flex-1 rounded-xl border border-border/60 bg-muted/20 p-3 overflow-y-auto max-h-[300px]">
                            {preview.isPending ? (
                                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground animate-pulse">
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    {bulkT('loading')}
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                                    {bulkT('empty')}
                                </div>
                            ) : (
                                <BulkGenerateList
                                    filteredItems={filteredItems}
                                    scope={scope}
                                    selected={selected}
                                    toggleSelected={toggleSelected}
                                    sourcesByModel={sourcesByModel}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
                    <Button type="button" variant="outline" className="rounded-xl h-9 text-xs" onClick={() => setOpen(false)}>
                        {bulkT('close')}
                    </Button>
                    <Button type="button" className="rounded-xl h-9 text-xs" onClick={handleGenerate} disabled={!canGenerate || generate.isPending || preview.isPending}>
                        {generate.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                        {generate.isPending ? bulkT('generating') : bulkT('generate')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
