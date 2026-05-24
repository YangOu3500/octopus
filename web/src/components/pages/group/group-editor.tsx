'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Trash2, HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useModelChannelList, type LLMChannel } from '@/api/endpoints/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GroupMode } from '@/api/endpoints/group';
import { MemberList, type SelectedMember } from './member-list';
import { ModelPickerSection } from './model-picker';
import { matchesGroupName, memberKey, normalizeKey, MODE_LABELS } from './group-utils';

export type GroupEditorValues = {
    name: string;
    match_regex: string;
    mode: GroupMode;
    first_token_time_out: number;
    session_keep_time: number;
    retry_enabled: boolean;
    max_retries: number;
    members: SelectedMember[];
};

function SortSection({
    members,
    onReorder,
    onRemove,
    onWeightChange,
    showWeight,
    onClear,
}: {
    members: SelectedMember[];
    onReorder: (members: SelectedMember[]) => void;
    onRemove: (id: string) => void;
    onWeightChange: (id: string, weight: number) => void;
    showWeight: boolean;
    onClear: () => void;
}) {
    const t = useTranslations('group');

    return (
        <div className="rounded-xl border border-border/50 bg-muted/30 flex flex-col h-[320px] md:h-auto min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/50">
                <span className="text-xs font-medium text-foreground">
                    {t('form.items')}
                    {members.length > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">
                            ({members.length})
                        </span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={onClear}
                    disabled={members.length === 0}
                    className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                        members.length === 0
                            ? 'text-muted-foreground/50 cursor-not-allowed'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    title={t('form.clear')}
                >
                    <Trash2 className="size-3.5" />
                    <span>清空</span>
                </button>
            </div>

            <div className="flex-1 min-h-0 p-2">
                <MemberList
                    members={members}
                    onReorder={onReorder}
                    onRemove={onRemove}
                    onWeightChange={onWeightChange}
                    showWeight={showWeight}
                />
            </div>
        </div>
    );
}

export function GroupEditor({
    initial,
    submitText,
    submittingText,
    isSubmitting,
    onSubmit,
    onCancel,
}: {
    initial?: Partial<GroupEditorValues>;
    submitText: string;
    submittingText: string;
    isSubmitting: boolean;
    onSubmit: (values: GroupEditorValues) => void;
    onCancel?: () => void;
}) {
    const t = useTranslations('group');
    const { data: modelChannels = [] } = useModelChannelList();

    const [groupName, setGroupName] = useState(initial?.name ?? '');
    const [matchRegex, setMatchRegex] = useState(initial?.match_regex ?? '');
    const [mode, setMode] = useState<GroupMode>((initial?.mode ?? 1) as GroupMode);
    const [firstTokenTimeOut, setFirstTokenTimeOut] = useState<number>(initial?.first_token_time_out ?? 0);
    const [sessionKeepTime, setSessionKeepTime] = useState<number>(initial?.session_keep_time ?? 0);
    const [retryEnabled, setRetryEnabled] = useState<boolean>(initial?.retry_enabled ?? false);
    const [maxRetries, setMaxRetries] = useState<number>(initial?.max_retries ?? 3);
    const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>(initial?.members ?? []);

    const groupKey = normalizeKey(groupName);
    const regexKey = matchRegex.trim();

    const { matchedModelChannels, regexError } = useMemo(() => {
        const parseRegex = (input: string): RegExp => {
            const inlineMatch = input.match(/^\(\?([ism]+)\)(.+)$/);
            if (inlineMatch) {
                const flagMap: Record<string, string> = { i: 'i', s: 's', m: 'm' };
                const flags = inlineMatch[1].split('').map(f => flagMap[f] || '').join('');
                return new RegExp(inlineMatch[2], flags);
            }
            return new RegExp(input);
        };

        if (regexKey) {
            try {
                const re = parseRegex(regexKey);
                return { matchedModelChannels: modelChannels.filter((mc) => re.test(mc.name)), regexError: '' };
            } catch (e) {
                return { matchedModelChannels: [], regexError: (e as Error)?.message ?? 'Invalid regex' };
            }
        }
        if (!groupKey) return { matchedModelChannels: [], regexError: '' };
        return { matchedModelChannels: modelChannels.filter((mc) => matchesGroupName(mc.name, groupKey)), regexError: '' };
    }, [groupKey, regexKey, modelChannels]);

    const handleAddMember = useCallback((channel: LLMChannel) => {
        const key = memberKey(channel);
        setSelectedMembers((prev) => {
            if (prev.some((m) => m.id === key)) return prev;
            return [...prev, { ...channel, id: key, weight: 1 }];
        });
    }, []);

    const autoAddDisabled = useMemo(() => {
        if ((!regexKey && !groupKey) || regexError || matchedModelChannels.length === 0) return true;
        const existing = new Set(selectedMembers.map((m) => m.id));
        return matchedModelChannels.every((mc) => existing.has(memberKey(mc)));
    }, [groupKey, regexKey, regexError, matchedModelChannels, selectedMembers]);

    const handleAutoAdd = useCallback(() => {
        if (matchedModelChannels.length === 0) return;
        setSelectedMembers((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const toAdd = matchedModelChannels
                .filter((mc) => !existing.has(memberKey(mc)))
                .map((mc) => ({ ...mc, id: memberKey(mc), weight: 1 }));
            return toAdd.length ? [...prev, ...toAdd] : prev;
        });
    }, [matchedModelChannels]);

    const handleWeightChange = useCallback((id: string, weight: number) => {
        setSelectedMembers((prev) => prev.map((m) => m.id === id ? { ...m, weight } : m));
    }, []);

    const handleRemoveMember = useCallback((id: string) => {
        setSelectedMembers((prev) => prev.filter((m) => m.id !== id));
    }, []);

    const handleClearMembers = useCallback(() => {
        setSelectedMembers([]);
    }, []);

    const isValid = groupKey.length > 0 && selectedMembers.length > 0 && !regexError;

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isValid) return;
        onSubmit({
            name: groupName,
            match_regex: regexKey,
            mode,
            first_token_time_out: firstTokenTimeOut,
            session_keep_time: sessionKeepTime,
            retry_enabled: retryEnabled,
            max_retries: maxRetries,
            members: selectedMembers,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0 text-xs">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-4">
                <div className="space-y-4 flex flex-col">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="group-name">{t('form.name')}</Label>
                            <Input
                                id="group-name"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                className="h-8 rounded-lg text-xs animate-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="group-match-regex">{t('form.matchRegex')}</Label>
                            <Input
                                id="group-match-regex"
                                value={matchRegex}
                                onChange={(e) => setMatchRegex(e.target.value)}
                                className="h-8 rounded-lg text-xs"
                                placeholder="匹配正则表达式"
                            />
                            {regexError && (
                                <p className="mt-1 text-[10px] text-destructive animate-none">
                                    无效正则: {regexError}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="group-first-token-time-out" className="flex items-center gap-1">
                                {t('form.firstTokenTimeOut')}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-xs">
                                            {t('form.firstTokenTimeOutHint')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </Label>
                            <Input
                                id="group-first-token-time-out"
                                type="number"
                                min={0}
                                value={String(firstTokenTimeOut)}
                                onChange={(e) => setFirstTokenTimeOut(Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-8 rounded-lg text-xs"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="group-session-keep-time" className="flex items-center gap-1">
                                {t('form.sessionKeepTime')}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-xs">
                                            {t('form.sessionKeepTimeHint')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </Label>
                            <Input
                                id="group-session-keep-time"
                                type="number"
                                min={0}
                                value={String(sessionKeepTime)}
                                onChange={(e) => setSessionKeepTime(Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-8 rounded-lg text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex gap-1 flex-1 min-w-[200px]">
                            {([1, 2, 3, 4] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    className={cn(
                                        'flex-1 py-1 text-[11px] rounded-lg transition-colors border',
                                        mode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-transparent'
                                    )}
                                >
                                    {t(`mode.${MODE_LABELS[m]}`)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Switch
                                    checked={retryEnabled}
                                    onCheckedChange={setRetryEnabled}
                                    className="scale-90"
                                />
                                <span className="text-xs text-muted-foreground">{t('form.retryEnabled')}</span>
                            </label>
                            {retryEnabled && (
                                <label className="flex items-center gap-1.5">
                                    <Input
                                        type="number"
                                        min={1}
                                        value={String(maxRetries)}
                                        onChange={(e) => setMaxRetries(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-12 h-7 rounded-lg text-xs text-center"
                                    />
                                    <span className="text-xs text-muted-foreground">{t('form.maxRetries')}</span>
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[350px] md:h-[400px]">
                        <ModelPickerSection
                            modelChannels={modelChannels}
                            selectedMembers={selectedMembers}
                            onAdd={handleAddMember}
                            onAutoAdd={handleAutoAdd}
                            autoAddDisabled={autoAddDisabled}
                        />
                        <SortSection
                            members={selectedMembers}
                            onReorder={setSelectedMembers}
                            onRemove={handleRemoveMember}
                            onWeightChange={handleWeightChange}
                            showWeight={mode === 4}
                            onClear={handleClearMembers}
                        />
                    </div>
                </div>
            </div>

            <div className="pt-4 mt-auto shrink-0 border-t flex gap-2">
                {onCancel && (
                    <Button type="button" variant="outline" className="flex-1 rounded-xl h-9 text-xs" onClick={onCancel}>
                        取消
                    </Button>
                )}
                <Button
                    type="submit"
                    disabled={!isValid || isSubmitting}
                    className="flex-1 rounded-xl h-9 text-xs"
                >
                    {isSubmitting ? submittingText : submitText}
                </Button>
            </div>
        </form>
    );
}
