'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Monitor, Globe, Clock, Shield, HelpCircle, X, Link, Activity, HeartPulse } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';

export function SettingSystem() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();

    const [proxyUrl, setProxyUrl] = useState('');
    const [statsSaveInterval, setStatsSaveInterval] = useState('');
    const [corsAllowOrigins, setCorsAllowOrigins] = useState('');
    const [corsInputValue, setCorsInputValue] = useState('');
    const [wsUpgradeEnabled, setWsUpgradeEnabled] = useState(false);
    const [groupHealthEnabled, setGroupHealthEnabled] = useState(false);
    const [sseHeartbeatInterval, setSseHeartbeatInterval] = useState('');
    const [ssePreStreamHeartbeatDelay, setSsePreStreamHeartbeatDelay] = useState('');

    const initialProxyUrl = useRef('');
    const initialStatsSaveInterval = useRef('');
    const initialCorsAllowOrigins = useRef('');
    const initialWsUpgradeEnabled = useRef(false);
    const initialGroupHealthEnabled = useRef(false);
    const initialSseHeartbeatInterval = useRef('');
    const initialSsePreStreamHeartbeatDelay = useRef('');

    useEffect(() => {
        if (settings) {
            const proxy = settings.find(s => s.key === SettingKey.ProxyURL);
            const interval = settings.find(s => s.key === SettingKey.StatsSaveInterval);
            const cors = settings.find(s => s.key === SettingKey.CORSAllowOrigins);
            const wsUpgrade = settings.find(s => s.key === SettingKey.RelayWSUpgradeEnabled);
            const groupHealth = settings.find(s => s.key === SettingKey.GroupHealthEnabled);
            const sseHeartbeat = settings.find(s => s.key === SettingKey.SSEHeartbeatInterval);
            const ssePreStreamHeartbeat = settings.find(s => s.key === SettingKey.SSEPreStreamHeartbeatDelay);
            if (proxy) {
                queueMicrotask(() => setProxyUrl(proxy.value));
                initialProxyUrl.current = proxy.value;
            }
            if (interval) {
                queueMicrotask(() => setStatsSaveInterval(interval.value));
                initialStatsSaveInterval.current = interval.value;
            }
            if (cors) {
                queueMicrotask(() => setCorsAllowOrigins(cors.value));
                initialCorsAllowOrigins.current = cors.value;
            }
            if (wsUpgrade) {
                const isEnabled = wsUpgrade.value === 'true';
                queueMicrotask(() => setWsUpgradeEnabled(isEnabled));
                initialWsUpgradeEnabled.current = isEnabled;
            }
            if (groupHealth) {
                const isEnabled = groupHealth.value === 'true';
                queueMicrotask(() => setGroupHealthEnabled(isEnabled));
                initialGroupHealthEnabled.current = isEnabled;
            }
            if (sseHeartbeat) {
                queueMicrotask(() => setSseHeartbeatInterval(sseHeartbeat.value));
                initialSseHeartbeatInterval.current = sseHeartbeat.value;
            }
            if (ssePreStreamHeartbeat) {
                queueMicrotask(() => setSsePreStreamHeartbeatDelay(ssePreStreamHeartbeat.value));
                initialSsePreStreamHeartbeatDelay.current = ssePreStreamHeartbeat.value;
            }
        }
    }, [settings]);

    const handleSave = (key: string, value: string, initialValue: string) => {
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                if (key === SettingKey.ProxyURL) {
                    initialProxyUrl.current = value;
                } else if (key === SettingKey.StatsSaveInterval) {
                    initialStatsSaveInterval.current = value;
                } else if (key === SettingKey.CORSAllowOrigins) {
                    initialCorsAllowOrigins.current = value;
                } else if (key === SettingKey.RelayWSUpgradeEnabled) {
                    initialWsUpgradeEnabled.current = value === 'true';
                } else if (key === SettingKey.GroupHealthEnabled) {
                    initialGroupHealthEnabled.current = value === 'true';
                } else if (key === SettingKey.SSEHeartbeatInterval) {
                    initialSseHeartbeatInterval.current = value;
                } else if (key === SettingKey.SSEPreStreamHeartbeatDelay) {
                    initialSsePreStreamHeartbeatDelay.current = value;
                }
            }
        });
    };

    const corsAllowOriginsList = useMemo(() => {
        const value = corsAllowOrigins.trim();
        if (!value) return [];
        if (value === '*') return ['*'];
        return Array.from(new Set(
            value
                .split(/[,\n，]/)
                .map(item => item.trim())
                .filter(Boolean)
        ));
    }, [corsAllowOrigins]);

    const corsAllowOriginsDisplay = useMemo(
        () => (corsAllowOriginsList.length > 0 ? corsAllowOriginsList.join(', ') : t('corsAllowOrigins.hint')),
        [corsAllowOriginsList, t]
    );

    const saveCorsAllowOrigins = (origins: string[]) => {
        const normalizedOrigins = Array.from(new Set(
            origins
                .map(origin => origin.trim())
                .filter(Boolean)
        ));
        const normalizedValue = normalizedOrigins.includes('*') ? '*' : normalizedOrigins.join(',');
        setCorsAllowOrigins(normalizedValue);
        handleSave(SettingKey.CORSAllowOrigins, normalizedValue, initialCorsAllowOrigins.current);
    };

    const handleAddCorsOrigin = () => {
        const newOrigins = Array.from(new Set(
            corsInputValue
                .split(/[,\n，]/)
                .map(item => item.trim())
                .filter(Boolean)
        ));
        if (newOrigins.length === 0) return;

        if (newOrigins.includes('*')) {
            saveCorsAllowOrigins(['*']);
            setCorsInputValue('');
            return;
        }

        const base = corsAllowOriginsList.includes('*') ? [] : corsAllowOriginsList;
        const merged = Array.from(new Set([...base, ...newOrigins]));
        saveCorsAllowOrigins(merged);
        setCorsInputValue('');
    };

    const handleRemoveCorsOrigin = (originToRemove: string) => {
        const nextOrigins = corsAllowOriginsList.filter(origin => origin !== originToRemove);
        saveCorsAllowOrigins(nextOrigins);
    };

    const handleWsUpgradeChange = (checked: boolean) => {
        setWsUpgradeEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.RelayWSUpgradeEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialWsUpgradeEnabled.current = checked;
                }
            }
        );
    };

    const handleGroupHealthChange = (checked: boolean) => {
        setGroupHealthEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.GroupHealthEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialGroupHealthEnabled.current = checked;
                },
                onError: () => setGroupHealthEnabled(initialGroupHealthEnabled.current),
            }
        );
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <Monitor className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('system')}</h3>
            </div>
            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                {/* 代理地址 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('proxyUrl.label')}</span>
                    </div>
                    <Input
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        onBlur={() => handleSave('proxy_url', proxyUrl, initialProxyUrl.current)}
                        placeholder="http://127.0.0.1:7890"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* 统计保存周期 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('statsSaveInterval.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={statsSaveInterval}
                        onChange={(e) => setStatsSaveInterval(e.target.value)}
                        onBlur={() => handleSave('stats_save_interval', statsSaveInterval, initialStatsSaveInterval.current)}
                        placeholder="秒 (例如 60)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* CORS 跨域白名单 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('corsAllowOrigins.label')}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[280px]">
                                    <p className="text-sm text-foreground/90 leading-relaxed">
                                        {t('corsAllowOrigins.hint')}
                                        <br />
                                        <span className="text-muted-foreground mt-1 block">{t('corsAllowOrigins.example')}</span>
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="w-64 min-h-9 rounded-xl border border-input bg-background/50 px-3 py-2 text-left text-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring hover:bg-background/80"
                                title={corsAllowOriginsDisplay}
                            >
                                <span className={`block overflow-hidden text-ellipsis whitespace-nowrap ${corsAllowOriginsList.length === 0 ? 'text-muted-foreground' : ''}`}>
                                    {corsAllowOriginsDisplay}
                                </span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] space-y-2 rounded-2xl p-3 bg-popover/95 backdrop-blur-xl border-border/50 shadow-xl">
                            <Input
                                value={corsInputValue}
                                onChange={(e) => setCorsInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddCorsOrigin();
                                    }
                                }}
                                placeholder="https://example.com"
                                className="h-9 rounded-xl"
                                autoFocus
                            />
                            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                                {corsAllowOriginsList.length > 0 && (
                                    corsAllowOriginsList.map((origin) => (
                                        <div key={origin} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/50 px-2.5 py-1.5">
                                            <span className="break-all text-xs leading-5 text-foreground/90">{origin}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCorsOrigin(origin)}
                                                className="text-muted-foreground transition-colors hover:text-destructive shrink-0"
                                                aria-label={`remove ${origin}`}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* SSE 流式心跳 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('sseHeartbeat.label')}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[280px]">
                                    <p className="text-sm text-foreground/90 leading-relaxed">
                                        {t('sseHeartbeat.description')}
                                        <br />
                                        <span className="text-muted-foreground mt-1 block">{t('sseHeartbeat.compatibility')}</span>
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Input
                        type="number"
                        min="0"
                        value={sseHeartbeatInterval}
                        onChange={(e) => setSseHeartbeatInterval(e.target.value)}
                        onBlur={() => handleSave(SettingKey.SSEHeartbeatInterval, sseHeartbeatInterval, initialSseHeartbeatInterval.current)}
                        placeholder="秒 (推荐 15)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* SSE 流建立前延迟心跳 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('ssePreStreamHeartbeat.label')}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[280px]">
                                    <p className="text-sm text-foreground/90 leading-relaxed">
                                        {t('ssePreStreamHeartbeat.description')}
                                        <br />
                                        <span className="text-muted-foreground mt-1 block">{t('ssePreStreamHeartbeat.risk')}</span>
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Input
                        type="number"
                        min="0"
                        value={ssePreStreamHeartbeatDelay}
                        onChange={(e) => setSsePreStreamHeartbeatDelay(e.target.value)}
                        onBlur={() => handleSave(SettingKey.SSEPreStreamHeartbeatDelay, ssePreStreamHeartbeatDelay, initialSsePreStreamHeartbeatDelay.current)}
                        placeholder="秒 (例如 2)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <HeartPulse className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('groupHealth.label')}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('groupHealth.description')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Switch
                        checked={groupHealthEnabled}
                        onCheckedChange={handleGroupHealthChange}
                    />
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Link className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('wsUpgrade.label')}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('wsUpgrade.description')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <Switch
                        checked={wsUpgradeEnabled}
                        onCheckedChange={handleWsUpgradeChange}
                    />
                </div>
            </div>
        </div>
    );
}
