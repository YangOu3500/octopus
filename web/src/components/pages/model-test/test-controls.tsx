'use client';

import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Channel } from '@/api/endpoints/channel';
import type { ModelTestMode } from '@/api/endpoints/model-test';

interface TestControlsProps {
    mode: ModelTestMode;
    setMode: (mode: ModelTestMode) => void;
    channels: Channel[];
    selectedChannelId: string;
    setSelectedChannelId: (id: string) => void;
    modelNames: string[];
    selectedModelName: string;
    setSelectedModelName: (name: string) => void;
    prompt: string;
    setPrompt: (prompt: string) => void;
    maxTokens: number;
    setMaxTokens: (tokens: number) => void;
    concurrency: number;
    setConcurrency: (c: number) => void;
    stream: boolean;
    setStream: (s: boolean) => void;
    showAdvanced: boolean;
    setShowAdvanced: (show: boolean) => void;
    query: string;
    setQuery: (query: string) => void;
}

export function TestControls({
    mode,
    setMode,
    channels,
    selectedChannelId,
    setSelectedChannelId,
    modelNames,
    selectedModelName,
    setSelectedModelName,
    prompt,
    setPrompt,
    maxTokens,
    setMaxTokens,
    concurrency,
    setConcurrency,
    stream,
    setStream,
    showAdvanced,
    setShowAdvanced,
    query,
    setQuery,
}: TestControlsProps) {
    const t = useTranslations('modelTest');

    return (
        <div className="flex flex-col gap-3 bg-card border border-border p-3.5 rounded-xl shadow-xs shrink-0">
            {/* Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/60">
                    <button
                        type="button"
                        onClick={() => setMode('channel')}
                        className={cn(
                            'h-7 rounded-md px-3 text-[11px] font-bold transition-all duration-150',
                            mode === 'channel'
                                ? 'bg-background text-foreground shadow-2xs'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('mode.channel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('model')}
                        className={cn(
                            'h-7 rounded-md px-3 text-[11px] font-bold transition-all duration-150',
                            mode === 'model'
                                ? 'bg-background text-foreground shadow-2xs'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('mode.model')}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="h-7 rounded-lg border border-border/80 bg-background/50 px-2.5 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    {showAdvanced ? t('clearVisible') : t('periods.allTime')} Settings
                </button>
            </div>

            {/* Inputs Panel */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[200px_1fr]">
                {mode === 'channel' ? (
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('channel')}</span>
                        <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                            <SelectTrigger className="w-full h-8.5 rounded-lg text-xs font-semibold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                {channels.map((channel) => (
                                    <SelectItem key={channel.id} value={String(channel.id)} className="text-xs">
                                        {channel.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('model')}</span>
                        <Select value={selectedModelName} onValueChange={setSelectedModelName}>
                            <SelectTrigger className="w-full h-8.5 rounded-lg text-xs font-semibold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                {modelNames.map((name) => (
                                    <SelectItem key={name} value={name} className="text-xs">
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('prompt')}</span>
                    <Input
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="rounded-lg h-8.5 text-xs bg-background/50"
                        placeholder={t('prompt')}
                    />
                </div>
            </div>

            {/* Advanced Panel */}
            {showAdvanced ? (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 border-t border-border/40 pt-3 transition-all duration-200">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('maxTokens')}</span>
                        <Input
                            type="number"
                            min={1}
                            max={256}
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(Math.max(1, Math.min(256, Number(e.target.value) || 1)))}
                            className="rounded-lg h-8.5 text-xs bg-background/50 font-mono"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('concurrency')}</span>
                        <Input
                            type="number"
                            min={1}
                            max={8}
                            value={concurrency}
                            onChange={(e) => setConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                            className="rounded-lg h-8.5 text-xs bg-background/50 font-mono"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">{t('protocol')}</span>
                        <Select value="auto" disabled>
                            <SelectTrigger className="w-full h-8.5 rounded-lg text-xs" disabled>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto" className="text-xs">{t('protocolAuto')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background/30 h-8.5 px-3 mt-5">
                        <span className="text-xs font-semibold text-muted-foreground">{t('stream')}</span>
                        <Switch checked={stream} onCheckedChange={setStream} className="scale-75 origin-right" />
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/10 h-8.5 px-3 text-xs text-muted-foreground/80">
                    <span className="font-medium">Stream Mode: {stream ? 'ON' : 'OFF'} ({maxTokens} max tokens)</span>
                    <Switch checked={stream} onCheckedChange={setStream} className="scale-75 origin-right" />
                </div>
            )}

            {/* Search Row */}
            <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={mode === 'channel' ? t('searchModel') : t('searchChannel')}
                    className="rounded-lg pl-8 h-8 text-xs bg-background/50"
                />
            </div>
        </div>
    );
}
