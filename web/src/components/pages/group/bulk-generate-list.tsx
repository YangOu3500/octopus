'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type GroupAutoGeneratePreviewItem } from '@/api/endpoints/group';
import { type LLMChannel } from '@/api/endpoints/model';
import { cn } from '@/lib/utils';
import { getModelIcon } from '@/lib/model-icons';

export function itemStatus(item: GroupAutoGeneratePreviewItem) {
    if (item.will_create) return 'create';
    if (item.will_add_count > 0) return 'fill';
    return 'skip';
}

function normalizedModelName(value: string) {
    return value.trim().toLowerCase();
}

export function previewItemModelKeys(item: GroupAutoGeneratePreviewItem) {
    const keys = new Set<string>();
    keys.add(normalizedModelName(item.model_name));
    item.aliases?.forEach((alias) => {
        const key = normalizedModelName(alias);
        if (key) keys.add(key);
    });
    keys.delete('');
    return Array.from(keys);
}

export function previewItemSources(item: GroupAutoGeneratePreviewItem, sourcesByModel: Map<string, LLMChannel[]>) {
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

interface BulkGenerateListProps {
    filteredItems: GroupAutoGeneratePreviewItem[];
    scope: 'all' | 'selected';
    selected: Set<string>;
    toggleSelected: (modelName: string) => void;
    sourcesByModel: Map<string, LLMChannel[]>;
}

export function BulkGenerateList({
    filteredItems,
    scope,
    selected,
    toggleSelected,
    sourcesByModel,
}: BulkGenerateListProps) {
    const bulkT = useTranslations('group.bulk');

    const strategyLabel = (strategy: string) => bulkT(`strategy.${strategy}`);

    return (
        <div className="grid gap-2 md:grid-cols-2 text-xs">
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
                const strategies = (item.match_strategies ?? []).map(strategyLabel);
                const strategyPreview = strategies.slice(0, 2).join(' / ');
                const strategyOverflow = strategies.length > 2 ? strategies.length - 2 : 0;

                return (
                    <button
                        key={item.model_name}
                        type="button"
                        onClick={() => scope === 'selected' && toggleSelected(item.model_name)}
                        className={cn(
                            'flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors',
                            scope === 'selected' ? 'hover:bg-muted cursor-pointer' : 'cursor-default',
                            selectedItem && scope === 'selected' && 'border-primary/60 bg-primary/5'
                        )}
                    >
                        <span className="shrink-0">
                            <Avatar size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{item.model_name}</span>
                            <span className="block truncate text-[10px] text-muted-foreground font-semibold">
                                {bulkT('row.candidates', { count: item.candidate_count })}
                                {' · '}
                                {status === 'create'
                                    ? bulkT('row.create')
                                    : status === 'fill'
                                        ? bulkT('row.fill', { count: item.will_add_count })
                                        : bulkT('row.skip')}
                            </span>
                            {sourcePreview && (
                                <span className="block truncate text-[10px] text-muted-foreground/80 font-medium">
                                    {sourcePreview}
                                    {sourceOverflow > 0 ? ` +${sourceOverflow}` : ''}
                                </span>
                            )}
                            {aliases.length > 0 && (
                                <span className="block truncate text-[10px] text-muted-foreground/80 font-medium">
                                    {bulkT('row.aliases', {
                                        aliases: `${aliasPreview}${aliasOverflow > 0 ? ` +${aliasOverflow}` : ''}`,
                                    })}
                                </span>
                            )}
                            {typeof item.match_score === 'number' && strategies.length > 0 && (
                                <span className="block truncate text-[10px] text-muted-foreground/80 font-medium">
                                    {bulkT('row.score', {
                                        score: item.match_score,
                                        strategies: `${strategyPreview}${strategyOverflow > 0 ? ` +${strategyOverflow}` : ''}`,
                                    })}
                                </span>
                            )}
                        </span>
                        {scope === 'selected' && (
                            <span className={cn(
                                'grid size-5 shrink-0 place-items-center rounded border border-border text-background transition-colors',
                                selectedItem && 'border-primary bg-primary text-primary-foreground'
                            )}>
                                {selectedItem && <Check className="size-3.5" />}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
