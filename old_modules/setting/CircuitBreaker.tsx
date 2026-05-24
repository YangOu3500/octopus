'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Zap, Hash, Timer, TimerOff, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';

export function SettingCircuitBreaker() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();

    const [threshold, setThreshold] = useState('');
    const [cooldown, setCooldown] = useState('');
    const [maxCooldown, setMaxCooldown] = useState('');

    const initialThreshold = useRef('');
    const initialCooldown = useRef('');
    const initialMaxCooldown = useRef('');

    useEffect(() => {
        if (settings) {
            const th = settings.find(s => s.key === SettingKey.CircuitBreakerThreshold);
            const cd = settings.find(s => s.key === SettingKey.CircuitBreakerCooldown);
            const mcd = settings.find(s => s.key === SettingKey.CircuitBreakerMaxCooldown);
            if (th) {
                queueMicrotask(() => setThreshold(th.value));
                initialThreshold.current = th.value;
            }
            if (cd) {
                queueMicrotask(() => setCooldown(cd.value));
                initialCooldown.current = cd.value;
            }
            if (mcd) {
                queueMicrotask(() => setMaxCooldown(mcd.value));
                initialMaxCooldown.current = mcd.value;
            }
        }
    }, [settings]);

    const handleSave = (key: string, value: string, initialValue: string) => {
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                if (key === SettingKey.CircuitBreakerThreshold) {
                    initialThreshold.current = value;
                } else if (key === SettingKey.CircuitBreakerCooldown) {
                    initialCooldown.current = value;
                } else if (key === SettingKey.CircuitBreakerMaxCooldown) {
                    initialMaxCooldown.current = value;
                }
            }
        });
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 pb-2">
                <Zap className="h-4 w-4 text-primary" />
                <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground/80">{t('circuitBreaker.title')}</h3>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="size-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px]">
                                <p className="text-sm text-foreground/90 leading-relaxed">
                                    {t('circuitBreaker.hint')}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-background/30 border border-border/40 px-4">
                {/* 熔断触发阈值 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('circuitBreaker.threshold.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={threshold}
                        onChange={(e) => setThreshold(e.target.value)}
                        onBlur={() => handleSave(SettingKey.CircuitBreakerThreshold, threshold, initialThreshold.current)}
                        placeholder="连续失败次数 (例如 10)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* 基础冷却时间 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('circuitBreaker.cooldown.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={cooldown}
                        onChange={(e) => setCooldown(e.target.value)}
                        onBlur={() => handleSave(SettingKey.CircuitBreakerCooldown, cooldown, initialCooldown.current)}
                        placeholder="秒 (例如 30)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>

                {/* 最大冷却时间 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <TimerOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('circuitBreaker.maxCooldown.label')}</span>
                    </div>
                    <Input
                        type="number"
                        value={maxCooldown}
                        onChange={(e) => setMaxCooldown(e.target.value)}
                        onBlur={() => handleSave(SettingKey.CircuitBreakerMaxCooldown, maxCooldown, initialMaxCooldown.current)}
                        placeholder="秒 (例如 3600)"
                        className="w-64 rounded-xl bg-background/50"
                    />
                </div>
            </div>
        </div>
    );
}
