'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, GitBranch, Loader2, Plus, RotateCcw, Save, Settings2, X } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/common/Toast';
import { SettingKey, useSetSetting, useSettingList } from '@/api/endpoints/setting';
import { useNavStore } from '@/components/modules/navbar';
import {
    ASSOCIATION_OPTION_KEYS,
    associationOptionsEqual,
    createManualAliasDraft,
    createManualAliasDraftFromValue,
    defaultAssociationOptions,
    manualAliasesEqual,
    parseSavedAssociationState,
    sanitizeManualAliases,
    type AssociationOptionKey,
    type ManualAliasDraft,
    type SavedAssociationState,
} from '@/lib/group-association';
import { cn } from '@/lib/utils';

export function SettingModelAssociation() {
    const { data: settings = [], isLoading: settingsLoading } = useSettingList();
    const savedAssociationState = useMemo(() => parseSavedAssociationState(settings), [settings]);
    const savedAssociationStateKey = useMemo(
        () => JSON.stringify(savedAssociationState),
        [savedAssociationState],
    );

    return (
        <SettingModelAssociationCard
            key={savedAssociationStateKey}
            savedAssociationState={savedAssociationState}
            settingsLoading={settingsLoading}
        />
    );
}

function SettingModelAssociationCard({
    savedAssociationState,
    settingsLoading,
}: {
    savedAssociationState: SavedAssociationState;
    settingsLoading: boolean;
}) {
    const t = useTranslations('setting');
    const bulkT = useTranslations('group.bulk');
    const setSetting = useSetSetting();
    const setActiveItem = useNavStore((state) => state.setActiveItem);
    const [associationMode, setAssociationMode] = useState(savedAssociationState.associationMode);
    const [associationOptions, setAssociationOptions] = useState(savedAssociationState.associationOptions);
    const [manualAliases, setManualAliases] = useState<ManualAliasDraft[]>(
        () => savedAssociationState.manualAliases.map(createManualAliasDraftFromValue),
    );
    const [manualPanelOpen, setManualPanelOpen] = useState(savedAssociationState.manualAliases.length > 0);

    const normalizedManualAliases = useMemo(() => sanitizeManualAliases(manualAliases), [manualAliases]);
    const hasPendingChanges = associationMode !== savedAssociationState.associationMode
        || !associationOptionsEqual(associationOptions, savedAssociationState.associationOptions)
        || !manualAliasesEqual(normalizedManualAliases, savedAssociationState.manualAliases);
    const enabledOptionCount = ASSOCIATION_OPTION_KEYS.reduce(
        (count, key) => count + (associationOptions[key] ? 1 : 0),
        0,
    );

    const setAssociationOption = (key: AssociationOptionKey, value: boolean) => {
        setAssociationOptions((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const resetToRecommended = () => {
        setAssociationOptions(defaultAssociationOptions(associationMode));
        setManualAliases([]);
    };

    const restoreSaved = () => {
        setAssociationMode(savedAssociationState.associationMode);
        setAssociationOptions(savedAssociationState.associationOptions);
        setManualAliases(savedAssociationState.manualAliases.map(createManualAliasDraftFromValue));
    };

    const addManualAlias = () => {
        setManualAliases((prev) => [...prev, createManualAliasDraft()]);
        setManualPanelOpen(true);
    };

    const updateManualAlias = (id: string, field: 'alias' | 'target', value: string) => {
        setManualAliases((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
    };

    const removeManualAlias = (id: string) => {
        setManualAliases((prev) => prev.filter((item) => item.id !== id));
    };

    const handleSave = async () => {
        try {
            await setSetting.mutateAsync({
                key: SettingKey.GroupAutoGenerateAssociationMode,
                value: associationMode,
            });
            await setSetting.mutateAsync({
                key: SettingKey.GroupAutoGenerateAssociationOptions,
                value: JSON.stringify(associationOptions),
            });
            await setSetting.mutateAsync({
                key: SettingKey.GroupAutoGenerateManualAliases,
                value: JSON.stringify(normalizedManualAliases),
            });
            toast.success(t('modelAssociation.saved'));
        } catch (error) {
            const description = error instanceof Error ? error.message : undefined;
            toast.error(t('modelAssociation.saveFailed'), description ? { description } : undefined);
        }
    };

    return (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
                        <GitBranch className="h-5 w-5" />
                        {t('modelAssociation.title')}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('modelAssociation.subtitle')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-md">
                        {bulkT(`association.${associationMode}`)}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                        {t('modelAssociation.summaryOptions', { count: enabledOptionCount })}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                        {t('modelAssociation.summaryManual', { count: normalizedManualAliases.length })}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={cn(
                            'rounded-md',
                            hasPendingChanges
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                        )}
                    >
                        {hasPendingChanges ? t('modelAssociation.pendingState') : t('modelAssociation.savedState')}
                    </Badge>
                </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                    {t('modelAssociation.description')}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={() => setActiveItem('group')}
                    >
                        {t('modelAssociation.openGroup')}
                        <ArrowRight className="size-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={restoreSaved}
                        disabled={settingsLoading || !hasPendingChanges}
                    >
                        <RotateCcw className="size-3.5" />
                        {t('modelAssociation.restore')}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={resetToRecommended}
                        disabled={setSetting.isPending}
                    >
                        <Settings2 className="size-3.5" />
                        {t('modelAssociation.reset')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={handleSave}
                        disabled={settingsLoading || setSetting.isPending || !hasPendingChanges}
                    >
                        {setSetting.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        {setSetting.isPending ? t('modelAssociation.saving') : t('modelAssociation.save')}
                    </Button>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {(['exact', 'alias'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => {
                            setAssociationMode(value);
                            setAssociationOptions(defaultAssociationOptions(value));
                        }}
                        className={cn(
                            'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            associationMode === value
                                ? 'bg-primary/90 text-primary-foreground'
                                : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        {bulkT(`association.${value}`)}
                    </button>
                ))}
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {ASSOCIATION_OPTION_KEYS.map((key) => (
                    <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-foreground">
                                {bulkT(`rules.options.${key}.label`)}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                {bulkT(`rules.options.${key}.help`)}
                            </div>
                        </div>
                        <Switch
                            checked={Boolean(associationOptions[key])}
                            onCheckedChange={(checked) => setAssociationOption(key, checked)}
                        />
                    </div>
                ))}
            </div>

            <Accordion
                type="single"
                collapsible
                value={manualPanelOpen ? 'manual' : undefined}
                onValueChange={(value) => setManualPanelOpen(value === 'manual')}
                className="mt-4"
            >
                <AccordionItem value="manual" className="overflow-hidden rounded-lg border border-border bg-background/40 px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                        <div className="min-w-0 text-left">
                            <div className="text-sm font-medium text-card-foreground">
                                {bulkT('rules.manualTitle')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {t('modelAssociation.summaryManual', { count: normalizedManualAliases.length })}
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                                {bulkT('rules.manualEmpty')}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg px-2.5 text-xs"
                                onClick={addManualAlias}
                            >
                                <Plus className="size-3.5" />
                                {bulkT('rules.addManual')}
                            </Button>
                        </div>

                        <div className="mt-3 space-y-2">
                            {manualAliases.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-[11px] text-muted-foreground">
                                    {t('modelAssociation.empty')}
                                </div>
                            ) : (
                                manualAliases.map((item) => (
                                    <div key={item.id} className="grid gap-2 rounded-lg border border-border/60 bg-card/60 p-2 lg:grid-cols-[1fr_1fr_auto]">
                                        <Input
                                            value={item.alias}
                                            onChange={(event) => updateManualAlias(item.id, 'alias', event.target.value)}
                                            placeholder={bulkT('rules.manualAliasPlaceholder')}
                                            className="h-9 rounded-lg"
                                        />
                                        <Input
                                            value={item.target}
                                            onChange={(event) => updateManualAlias(item.id, 'target', event.target.value)}
                                            placeholder={bulkT('rules.manualTargetPlaceholder')}
                                            className="h-9 rounded-lg"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-9 rounded-lg px-3"
                                            onClick={() => removeManualAlias(item.id)}
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
