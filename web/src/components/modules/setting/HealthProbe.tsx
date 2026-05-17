'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, Gauge, Hash, HeartPulse, HelpCircle, MessageSquare, Percent, Send, Shuffle, Thermometer, Timer, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';

type RuntimeSettingKey = typeof SettingKey[keyof typeof SettingKey];

type FieldConfig = {
    key: RuntimeSettingKey;
    icon: LucideIcon;
    label: string;
    hint: string;
    inputMode?: 'numeric' | 'decimal' | 'text';
    min?: string;
    max?: string;
    step?: string;
};

const defaultValues: Record<string, string> = {
    [SettingKey.HealthScoreWindowMinutes]: '60',
    [SettingKey.HealthMinConfidentSample]: '10',
    [SettingKey.SuccessRatePenaltyWeight]: '70',
    [SettingKey.EmptyResponsePenaltyWeight]: '25',
    [SettingKey.LatencyPenaltyWeight]: '8',
    [SettingKey.ProbeSiteMinInterval]: '30',
    [SettingKey.ProbeModelMinInterval]: '12',
    [SettingKey.ProbeMaxConcurrency]: '1',
    [SettingKey.ProbeDailyMaxRequests]: '20',
    [SettingKey.ProbePrompt]: '只回复 OK',
    [SettingKey.ProbeMaxTokens]: '8',
    [SettingKey.ProbeTemperature]: '0',
    [SettingKey.ProbeJitterRatio]: '0.25',
};

function SettingRow({
    icon: Icon,
    label,
    hint,
    children,
}: {
    icon: LucideIcon;
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-sm font-medium">{label}</span>
                {hint && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="size-4 shrink-0 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                {hint}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            {children}
        </div>
    );
}

export function SettingHealthProbe() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const setSetting = useSetSetting();

    const [values, setValues] = useState<Record<string, string>>(defaultValues);
    const [healthScoreEnabled, setHealthScoreEnabled] = useState(false);
    const [probeEnabled, setProbeEnabled] = useState(false);

    const initialValues = useRef<Record<string, string>>(defaultValues);
    const initialHealthScoreEnabled = useRef(false);
    const initialProbeEnabled = useRef(false);

    const healthFields: FieldConfig[] = [
        {
            key: SettingKey.HealthScoreWindowMinutes,
            icon: Timer,
            label: t('healthProbe.health.window.label'),
            hint: t('healthProbe.health.window.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.HealthMinConfidentSample,
            icon: Hash,
            label: t('healthProbe.health.sample.label'),
            hint: t('healthProbe.health.sample.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.SuccessRatePenaltyWeight,
            icon: Percent,
            label: t('healthProbe.health.failureWeight.label'),
            hint: t('healthProbe.health.failureWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.EmptyResponsePenaltyWeight,
            icon: Activity,
            label: t('healthProbe.health.emptyWeight.label'),
            hint: t('healthProbe.health.emptyWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.LatencyPenaltyWeight,
            icon: Gauge,
            label: t('healthProbe.health.latencyWeight.label'),
            hint: t('healthProbe.health.latencyWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
    ];

    const probeFields: FieldConfig[] = [
        {
            key: SettingKey.ProbeSiteMinInterval,
            icon: Timer,
            label: t('healthProbe.probe.siteInterval.label'),
            hint: t('healthProbe.probe.siteInterval.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeModelMinInterval,
            icon: Timer,
            label: t('healthProbe.probe.modelInterval.label'),
            hint: t('healthProbe.probe.modelInterval.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeMaxConcurrency,
            icon: Send,
            label: t('healthProbe.probe.concurrency.label'),
            hint: t('healthProbe.probe.concurrency.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeDailyMaxRequests,
            icon: Hash,
            label: t('healthProbe.probe.dailyBudget.label'),
            hint: t('healthProbe.probe.dailyBudget.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbePrompt,
            icon: MessageSquare,
            label: t('healthProbe.probe.prompt.label'),
            hint: t('healthProbe.probe.prompt.hint'),
            inputMode: 'text',
        },
        {
            key: SettingKey.ProbeMaxTokens,
            icon: Hash,
            label: t('healthProbe.probe.maxTokens.label'),
            hint: t('healthProbe.probe.maxTokens.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeTemperature,
            icon: Thermometer,
            label: t('healthProbe.probe.temperature.label'),
            hint: t('healthProbe.probe.temperature.hint'),
            inputMode: 'decimal',
            min: '0',
            max: '2',
            step: '0.1',
        },
        {
            key: SettingKey.ProbeJitterRatio,
            icon: Shuffle,
            label: t('healthProbe.probe.jitter.label'),
            hint: t('healthProbe.probe.jitter.hint'),
            inputMode: 'decimal',
            min: '0',
            max: '1',
            step: '0.05',
        },
    ];

    useEffect(() => {
        if (!settings) return;

        const nextValues = { ...defaultValues };
        for (const key of Object.keys(defaultValues)) {
            const setting = settings.find(s => s.key === key);
            if (setting) {
                nextValues[key] = setting.value;
            }
        }
        queueMicrotask(() => setValues(nextValues));
        initialValues.current = nextValues;

        const healthScore = settings.find(s => s.key === SettingKey.HealthScoreEnabled);
        const nextHealthScoreEnabled = healthScore?.value === 'true';
        queueMicrotask(() => setHealthScoreEnabled(nextHealthScoreEnabled));
        initialHealthScoreEnabled.current = nextHealthScoreEnabled;

        const probe = settings.find(s => s.key === SettingKey.ProbeEnabled);
        const nextProbeEnabled = probe?.value === 'true';
        queueMicrotask(() => setProbeEnabled(nextProbeEnabled));
        initialProbeEnabled.current = nextProbeEnabled;
    }, [settings]);

    const handleValueChange = (key: string, value: string) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    const handleValueSave = (key: string, value: string) => {
        const initialValue = initialValues.current[key] ?? '';
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                initialValues.current = { ...initialValues.current, [key]: value };
            },
            onError: () => {
                setValues(prev => ({ ...prev, [key]: initialValue }));
            },
        });
    };

    const handleHealthScoreChange = (checked: boolean) => {
        setHealthScoreEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.HealthScoreEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialHealthScoreEnabled.current = checked;
                },
                onError: () => setHealthScoreEnabled(initialHealthScoreEnabled.current),
            }
        );
    };

    const handleProbeChange = (checked: boolean) => {
        setProbeEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.ProbeEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialProbeEnabled.current = checked;
                },
                onError: () => setProbeEnabled(initialProbeEnabled.current),
            }
        );
    };

    const renderField = (field: FieldConfig) => (
        <SettingRow key={field.key} icon={field.icon} label={field.label} hint={field.hint}>
            <Input
                type={field.inputMode === 'text' ? 'text' : 'number'}
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.key] ?? ''}
                onChange={(e) => handleValueChange(field.key, e.target.value)}
                onBlur={() => handleValueSave(field.key, values[field.key] ?? '')}
                className="w-full rounded-xl sm:w-48"
            />
        </SettingRow>
    );

    return (
        <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
                <HeartPulse className="h-5 w-5" />
                {t('healthProbe.title')}
            </h2>

            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Gauge className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('healthProbe.health.title')}</div>
                            <div className="text-xs text-muted-foreground">{t('healthProbe.health.subtitle')}</div>
                        </div>
                    </div>
                    <Switch checked={healthScoreEnabled} onCheckedChange={handleHealthScoreChange} />
                </div>
                <div className="space-y-4">
                    {healthFields.map(renderField)}
                </div>
            </div>

            <div className="border-t border-border pt-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Activity className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('healthProbe.probe.title')}</div>
                            <div className="text-xs text-muted-foreground">{t('healthProbe.probe.subtitle')}</div>
                        </div>
                    </div>
                    <Switch checked={probeEnabled} onCheckedChange={handleProbeChange} />
                </div>
                <div className="space-y-4">
                    {probeFields.map(renderField)}
                </div>
            </div>
        </div>
    );
}
