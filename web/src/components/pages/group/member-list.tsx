'use client';

import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getModelIcon } from '@/lib/model-icons';
import type { LLMChannel } from '@/api/endpoints/model';

export interface SelectedMember extends LLMChannel {
    id: string;
    item_id?: number;
    weight?: number;
}

interface MemberListProps {
    members: SelectedMember[];
    onReorder: (members: SelectedMember[]) => void;
    onRemove: (id: string) => void;
    onWeightChange?: (id: string, weight: number) => void;
    showWeight?: boolean;
}

export function MemberList({
    members,
    onReorder,
    onRemove,
    onWeightChange,
    showWeight = false,
}: MemberListProps) {
    const t = useTranslations('group');

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newMembers = [...members];
        const temp = newMembers[index];
        newMembers[index] = newMembers[index - 1];
        newMembers[index - 1] = temp;
        onReorder(newMembers);
    };

    const handleMoveDown = (index: number) => {
        if (index === members.length - 1) return;
        const newMembers = [...members];
        const temp = newMembers[index];
        newMembers[index] = newMembers[index + 1];
        newMembers[index + 1] = temp;
        onReorder(newMembers);
    };

    if (members.length === 0) {
        return (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground">
                <span className="text-xs">{t('card.empty')}</span>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
                {members.map((member, index) => {
                    const { Avatar: ModelAvatar } = getModelIcon(member.name);
                    const isDisabled = member.enabled === false;
                    const isSiteChannel = member.site_id != null;
                    const sourceLabel = [
                        member.channel_name,
                        isSiteChannel ? null : member.endpoint_type?.trim()
                    ].filter(Boolean).join(' · ');

                    return (
                        <div
                            key={member.id}
                            className={cn(
                                'flex items-center gap-3 rounded-xl bg-background/50 border border-border/30 px-3 py-2 select-none hover:border-border/60 hover:bg-background/80 transition-all',
                                isDisabled && 'opacity-60 grayscale'
                            )}
                        >
                            <span className="size-5 rounded-lg text-[10px] font-bold grid place-items-center shrink-0 border bg-primary/10 text-primary border-primary/20">
                                {index + 1}
                            </span>

                            <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleMoveUp(index)}
                                    disabled={index === 0}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ArrowUp className="size-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleMoveDown(index)}
                                    disabled={index === members.length - 1}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ArrowDown className="size-3" />
                                </button>
                            </div>

                            <span className="shrink-0">
                                <ModelAvatar size={18} />
                            </span>

                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                <span className="text-xs font-semibold truncate text-foreground text-left">
                                    {member.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground/80 truncate text-left font-medium">
                                    {sourceLabel}
                                </span>
                            </div>

                            {showWeight && onWeightChange && (
                                <input
                                    type="number"
                                    min={1}
                                    value={member.weight ?? 1}
                                    onChange={(e) => onWeightChange(member.id, Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-12 h-6 text-xs text-center font-semibold rounded-md border border-border/50 bg-background/60 focus:outline-none focus:ring-1 focus:ring-secondary transition-all"
                                />
                            )}

                            <button
                                type="button"
                                onClick={() => onRemove(member.id)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/75 hover:text-destructive transition-colors"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
