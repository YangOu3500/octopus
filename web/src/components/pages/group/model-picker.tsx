'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronDown, Plus, Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { type LLMChannel } from '@/api/endpoints/model';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { getModelIcon } from '@/lib/model-icons';
import { type SelectedMember } from './member-list';
import { memberKey } from './group-utils';

export function ModelPickerSection({
    modelChannels,
    selectedMembers,
    onAdd,
    onAutoAdd,
    autoAddDisabled,
}: {
    modelChannels: LLMChannel[];
    selectedMembers: SelectedMember[];
    onAdd: (channel: LLMChannel) => void;
    onAutoAdd: () => void;
    autoAddDisabled: boolean;
}) {
    const t = useTranslations('group');
    const [searchKeyword, setSearchKeyword] = useState('');

    const selectedKeys = useMemo(() => new Set(selectedMembers.map(memberKey)), [selectedMembers]);
    const normalizedSearch = searchKeyword.trim().toLowerCase();

    const channels = useMemo(() => {
        const byId = new Map<number, { id: number; name: string; models: LLMChannel[] }>();
        modelChannels.forEach((mc) => {
            const existing = byId.get(mc.channel_id);
            if (existing) existing.models.push(mc);
            else byId.set(mc.channel_id, { id: mc.channel_id, name: mc.channel_name, models: [mc] });
        });

        return Array.from(byId.values())
            .map((c) => ({ ...c, models: [...c.models].sort((a, b) => a.name.localeCompare(b.name)) }))
            .sort((a, b) => a.id - b.id);
    }, [modelChannels]);

    const filteredChannels = useMemo(() => {
        if (!normalizedSearch) return channels;
        return channels.reduce<typeof channels>((acc, channel) => {
            if (channel.name.toLowerCase().includes(normalizedSearch)) {
                acc.push(channel);
                return acc;
            }

            const models = channel.models.filter((model) => model.name.toLowerCase().includes(normalizedSearch));
            if (models.length > 0) acc.push({ ...channel, models });
            return acc;
        }, []);
    }, [channels, normalizedSearch]);

    const modelSourceLabel = (model: LLMChannel) => [model.site_name, model.site_account_name, model.site_group_name]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' / ');

    return (
        <div className="rounded-xl border border-border/50 bg-muted/30 flex flex-col h-[320px] md:h-auto min-h-0 text-xs">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-muted/50">
                <span className="text-xs font-medium text-foreground">
                    {t('form.addItem')}
                </span>

                <div className="relative w-28">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        className="h-6 rounded-lg border-border/60 bg-background/70 pl-7 pr-2 text-[11px] focus-visible:ring-0"
                    />
                </div>

                <button
                    type="button"
                    onClick={onAutoAdd}
                    className={cn(
                        'shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                        autoAddDisabled
                            ? 'text-muted-foreground/50 cursor-not-allowed'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    disabled={autoAddDisabled}
                    title={t('form.autoAdd')}
                >
                    <Sparkles className="size-3.5" />
                    <span>自动</span>
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <Accordion type="multiple" className="w-full space-y-2">
                    {filteredChannels.map((channel) => {
                        const total = channel.models.length;
                        const selectedCount = channel.models.reduce(
                            (acc, m) => acc + (selectedKeys.has(memberKey(m)) ? 1 : 0),
                            0
                        );
                        const available = total - selectedCount;

                        return (
                            <AccordionItem key={channel.id} value={`channel-${channel.id}`}>
                                <AccordionPrimitive.Header className="rounded-lg bg-muted flex px-2 overflow-hidden">
                                    <AccordionPrimitive.Trigger className="flex flex-1 min-w-0 items-center justify-between py-2 text-left text-xs outline-none [&[data-state=open]>svg]:rotate-180">
                                        <span className="truncate font-semibold">{channel.name}</span>
                                        <div className="flex items-center gap-1 shrink-0 pr-1">
                                            <span className="text-[10px] text-muted-foreground">
                                                {available}/{total}
                                            </span>
                                            <ChevronDown className="text-muted-foreground size-3.5 transition-transform duration-200" />
                                        </div>
                                    </AccordionPrimitive.Trigger>
                                </AccordionPrimitive.Header>
                                <AccordionContent className="px-1 pt-2">
                                    <div className="flex flex-col gap-1.5">
                                        {channel.models.map((m) => {
                                            const isSelected = selectedKeys.has(memberKey(m));
                                            const { Avatar } = getModelIcon(m.name);
                                            const sourceLabel = modelSourceLabel(m);
                                            const isSiteChannel = m.site_id != null;
                                            const suffix = [sourceLabel, isSiteChannel ? null : m.endpoint_type?.trim()]
                                                .filter(Boolean)
                                                .join(' · ');
                                            return (
                                                <button
                                                    key={memberKey(m)}
                                                    type="button"
                                                    onClick={() => !isSelected && onAdd(m)}
                                                    disabled={isSelected}
                                                    className={cn(
                                                        'w-full flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background px-2 py-1.5 text-left transition-colors',
                                                        isSelected ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted'
                                                    )}
                                                >
                                                    <span className="flex items-center gap-2 min-w-0">
                                                        <Avatar size={14} />
                                                        <span className="min-w-0 flex flex-col">
                                                            <span className="text-xs font-medium truncate">{m.name}</span>
                                                            {suffix && <span className="text-[9px] text-muted-foreground truncate">{suffix}</span>}
                                                        </span>
                                                    </span>

                                                    <span className="shrink-0 text-muted-foreground">
                                                        {isSelected ? (
                                                            <Check className="size-3 text-primary" />
                                                        ) : (
                                                            <Plus className="size-3" />
                                                        )}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </div>
        </div>
    );
}
