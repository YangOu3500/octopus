'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Activity,
    FileWarning,
    Gauge,
    Hash,
    HeartPulse,
    MessageSquare,
    Network,
    Percent,
    Send,
    Shuffle,
    Thermometer,
    Timer,
    type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHealthCooldownPolicy, useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from 'sonner';
import { CooldownPolicies } from './tab-health-cooldown';

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

type SwitchConfig = {
    key: RuntimeSettingKey;
    icon: LucideIcon;
    label: string;
    hint: string;
};

const defaultValues: Record<string, string> = {
    [SettingKey.HealthScoreWindowMinutes]: '60',
    [SettingKey.HealthMinConfidentSample]: '10',
    [SettingKey.SuccessRatePenaltyWeight]: '70',
    [SettingKey.EmptyResponsePenaltyWeight]: '25',
    [SettingKey.LatencyPenaltyWeight]: '8',
    [SettingKey.ChannelConcurrencyMode]: 'local',
    [SettingKey.ChannelConcurrencyMax]: '1',
    [SettingKey.ChannelConcurrencyQueueMS]: '1000',
    [SettingKey.ChannelConcurrencyLeaseMS]: '120000',
    [SettingKey.StreamFirstValidTimeout]: '15',
    [SettingKey.StreamFirstValidMaxBuffer]: '65536',
    [SettingKey.StreamEmptyDoneAsFailure]: 'true',
    [SettingKey.StreamInvalidSSEAsFailure]: 'true',
    [SettingKey.ProbeSiteMinInterval]: '30',
    [SettingKey.ProbeModelMinInterval]: '12',
    [SettingKey.ProbeMaxConcurrency]: '1',
    [SettingKey.ProbeDailyMaxRequests]: '20',
    [SettingKey.ProbePrompt]: '只回答 OK',
    [SettingKey.ProbeMaxTokens]: '8',
    [SettingKey.ProbeTemperature]: '0',
    [SettingKey.ProbeJitterRatio]: '0.25',
    [SettingKey.ProbeStreamEnabled]: 'false',
};

function SectionShell({
    icon: Icon,
    title,
    subtitle,
    action,
    children,
}: {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    <div>
                        <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
                        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
                {action && <div>{action}</div>}
            </div>
            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                {children}
            </div>
        </section>
    );
}

export function SettingHealthProbe() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const { data: cooldownPolicies = [] } = useHealthCooldownPolicy();
    const setSetting = useSetSetting();

    const [values, setValues] = useState<Record<string, string>>(defaultValues);
    const [healthScoreEnabled, setHealthScoreEnabled] = useState(false);
    const [channelConcurrencyEnabled, setChannelConcurrencyEnabled] = useState(false);
    const [probeEnabled, setProbeEnabled] = useState(false);

    const initialValues = useRef<Record<string, string>>(defaultValues);
    const initialHealthScoreEnabled = useRef(false);
    const initialChannelConcurrencyEnabled = useRef(false);
    const initialProbeEnabled = useRef(false);

    const healthFields: FieldConfig[] = [
        { key: SettingKey.HealthScoreWindowMinutes, icon: Timer, label: t('healthProbe.health.window.label'), hint: t('healthProbe.health.window.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.HealthMinConfidentSample, icon: Hash, label: t('healthProbe.health.sample.label'), hint: t('healthProbe.health.sample.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.SuccessRatePenaltyWeight, icon: Percent, label: t('healthProbe.health.failureWeight.label'), hint: t('healthProbe.health.failureWeight.hint'), inputMode: 'numeric', min: '0' },
        { key: SettingKey.EmptyResponsePenaltyWeight, icon: Activity, label: t('healthProbe.health.emptyWeight.label'), hint: t('healthProbe.health.emptyWeight.hint'), inputMode: 'numeric', min: '0' },
        { key: SettingKey.LatencyPenaltyWeight, icon: Gauge, label: t('healthProbe.health.latencyWeight.label'), hint: t('healthProbe.health.latencyWeight.hint'), inputMode: 'numeric', min: '0' },
    ];

    const probeFields: FieldConfig[] = [
        { key: SettingKey.ProbeSiteMinInterval, icon: Timer, label: t('healthProbe.probe.siteInterval.label'), hint: t('healthProbe.probe.siteInterval.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ProbeModelMinInterval, icon: Timer, label: t('healthProbe.probe.modelInterval.label'), hint: t('healthProbe.probe.modelInterval.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ProbeMaxConcurrency, icon: Send, label: t('healthProbe.probe.concurrency.label'), hint: t('healthProbe.probe.concurrency.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ProbeDailyMaxRequests, icon: Hash, label: t('healthProbe.probe.dailyBudget.label'), hint: t('healthProbe.probe.dailyBudget.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ProbePrompt, icon: MessageSquare, label: t('healthProbe.probe.prompt.label'), hint: t('healthProbe.probe.prompt.hint'), inputMode: 'text' },
        { key: SettingKey.ProbeMaxTokens, icon: Hash, label: t('healthProbe.probe.maxTokens.label'), hint: t('healthProbe.probe.maxTokens.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ProbeTemperature, icon: Thermometer, label: t('healthProbe.probe.temperature.label'), hint: t('healthProbe.probe.temperature.hint'), inputMode: 'decimal', min: '0', max: '2', step: '0.1' },
        { key: SettingKey.ProbeJitterRatio, icon: Shuffle, label: t('healthProbe.probe.jitter.label'), hint: t('healthProbe.probe.jitter.hint'), inputMode: 'decimal', min: '0', max: '1', step: '0.05' },
    ];

    const channelConcurrencyFields: FieldConfig[] = [
        { key: SettingKey.ChannelConcurrencyMax, icon: Hash, label: t('healthProbe.channelConcurrency.max.label'), hint: t('healthProbe.channelConcurrency.max.hint'), inputMode: 'numeric', min: '1' },
        { key: SettingKey.ChannelConcurrencyQueueMS, icon: Timer, label: t('healthProbe.channelConcurrency.queue.label'), hint: t('healthProbe.channelConcurrency.queue.hint'), inputMode: 'numeric', min: '0' },
        { key: SettingKey.ChannelConcurrencyLeaseMS, icon: Timer, label: t('healthProbe.channelConcurrency.lease.label'), hint: t('healthProbe.channelConcurrency.lease.hint'), inputMode: 'numeric', min: '1' },
    ];

    const probeSwitchFields: SwitchConfig[] = [
        { key: SettingKey.ProbeStreamEnabled, icon: Activity, label: t('healthProbe.probe.stream.label'), hint: t('healthProbe.probe.stream.hint') },
    ];

    const streamFields: FieldConfig[] = [
        { key: SettingKey.StreamFirstValidTimeout, icon: Timer, label: t('healthProbe.stream.timeout.label'), hint: t('healthProbe.stream.timeout.hint'), inputMode: 'numeric', min: '0' },
        { key: SettingKey.StreamFirstValidMaxBuffer, icon: Hash, label: t('healthProbe.stream.buffer.label'), hint: t('healthProbe.stream.buffer.hint'), inputMode: 'numeric', min: '1' },
    ];

    const streamSwitchFields: SwitchConfig[] = [
        { key: SettingKey.StreamEmptyDoneAsFailure, icon: Activity, label: t('healthProbe.stream.emptyDone.label'), hint: t('healthProbe.stream.emptyDone.hint') },
        { key: SettingKey.StreamInvalidSSEAsFailure, icon: FileWarning, label: t('healthProbe.stream.invalidSSE.label'), hint: t('healthProbe.stream.invalidSSE.hint') },
    ];

    useEffect(() => {
        if (!settings) return;

        const nextValues = { ...defaultValues };
        for (const key of Object.keys(defaultValues)) {
            const setting = settings.find((item) => item.key === key);
            if (setting) nextValues[key] = setting.value;
        }
        setValues(nextValues);
        initialValues.current = nextValues;

        const nextHealthScoreEnabled = settings.find((item) => item.key === SettingKey.HealthScoreEnabled)?.value === 'true';
        const nextChannelConcurrencyEnabled = settings.find((item) => item.key === SettingKey.ChannelConcurrencyEnabled)?.value === 'true';
        const nextProbeEnabled = settings.find((item) => item.key === SettingKey.ProbeEnabled)?.value === 'true';

        setHealthScoreEnabled(nextHealthScoreEnabled);
        setChannelConcurrencyEnabled(nextChannelConcurrencyEnabled);
        setProbeEnabled(nextProbeEnabled);

        initialHealthScoreEnabled.current = nextHealthScoreEnabled;
        initialChannelConcurrencyEnabled.current = nextChannelConcurrencyEnabled;
        initialProbeEnabled.current = nextProbeEnabled;
    }, [settings]);

    const handleValueChange = (key: string, value: string) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    const handleValueSave = (key: string, value: string) => {
        const initialValue = initialValues.current[key] ?? '';
        if (value === initialValue) return;

        setSetting.mutate(
            { key, value },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialValues.current = { ...initialValues.current, [key]: value };
                },
                onError: () => {
                    setValues((prev) => ({ ...prev, [key]: initialValue }));
                },
            },
        );
    };

    const handleSwitchSave = (key: string, checked: boolean) => {
        const value = checked ? 'true' : 'false';
        const initialValue = initialValues.current[key] ?? 'false';
        if (value === initialValue) return;

        setValues((prev) => ({ ...prev, [key]: value }));
        setSetting.mutate(
            { key, value },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialValues.current = { ...initialValues.current, [key]: value };
                },
                onError: () => {
                    setValues((prev) => ({ ...prev, [key]: initialValue }));
                },
            },
        );
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
            },
        );
    };

    const handleChannelConcurrencyChange = (checked: boolean) => {
        setChannelConcurrencyEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.ChannelConcurrencyEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialChannelConcurrencyEnabled.current = checked;
                },
                onError: () => setChannelConcurrencyEnabled(initialChannelConcurrencyEnabled.current),
            },
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
            },
        );
    };

    const renderFieldCard = (field: FieldConfig) => {
        const Icon = field.icon;
        return (
            <div key={field.key} className="flex flex-col py-3 gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 group">
                <div className="flex items-start gap-3">
                    <Icon className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground/90">{field.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-normal">{field.hint}</span>
                    </div>
                </div>
                <Input
                    type={field.inputMode === 'text' ? 'text' : 'number'}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={values[field.key] ?? ''}
                    onChange={(event) => handleValueChange(field.key, event.target.value)}
                    onBlur={() => handleValueSave(field.key, values[field.key] ?? '')}
                    className="w-full sm:w-64 shrink-0 rounded-xl bg-background text-xs"
                />
            </div>
        );
    };

    const renderSwitchCard = (field: SwitchConfig) => {
        const Icon = field.icon;
        return (
            <div key={field.key} className="flex flex-col py-3 gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 group">
                <div className="flex items-start gap-3">
                    <Icon className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground/90">{field.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-normal">{field.hint}</span>
                    </div>
                </div>
                <div className="flex justify-start sm:justify-end shrink-0">
                    <Switch
                        checked={(values[field.key] ?? 'false') === 'true'}
                        onCheckedChange={(checked) => handleSwitchSave(field.key, checked)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <SectionShell
                icon={HeartPulse}
                title={t('healthProbe.health.title')}
                subtitle={t('healthProbe.health.subtitle')}
                action={<Switch checked={healthScoreEnabled} onCheckedChange={handleHealthScoreChange} />}
            >
                {healthFields.map(renderFieldCard)}
            </SectionShell>

            <SectionShell
                icon={Network}
                title={t('healthProbe.channelConcurrency.title')}
                subtitle={t('healthProbe.channelConcurrency.subtitle')}
                action={<Switch checked={channelConcurrencyEnabled} onCheckedChange={handleChannelConcurrencyChange} />}
            >
                <div className="flex flex-col py-3 gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 group">
                    <div className="flex items-start gap-3">
                        <Network className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-foreground/90">{t('healthProbe.channelConcurrency.mode.label')}</span>
                            <span className="text-[10px] text-muted-foreground leading-normal">{t('healthProbe.channelConcurrency.mode.hint')}</span>
                        </div>
                    </div>
                    <Select
                        value={values[SettingKey.ChannelConcurrencyMode] ?? 'local'}
                        onValueChange={(value) => {
                            setValues((prev) => ({ ...prev, [SettingKey.ChannelConcurrencyMode]: value }));
                            handleValueSave(SettingKey.ChannelConcurrencyMode, value);
                        }}
                    >
                        <SelectTrigger className="w-full sm:w-64 shrink-0 rounded-xl bg-background text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="local" className="rounded-xl text-xs">{t('healthProbe.channelConcurrency.mode.local')}</SelectItem>
                            <SelectItem value="database" className="rounded-xl text-xs">{t('healthProbe.channelConcurrency.mode.database')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {channelConcurrencyFields.map(renderFieldCard)}
            </SectionShell>

            <SectionShell
                icon={Timer}
                title={t('healthProbe.stream.title')}
                subtitle={t('healthProbe.stream.subtitle')}
            >
                {streamFields.map(renderFieldCard)}
                {streamSwitchFields.map(renderSwitchCard)}
            </SectionShell>

            <CooldownPolicies cooldownPolicies={cooldownPolicies} />

            <SectionShell
                icon={Activity}
                title={t('healthProbe.probe.title')}
                subtitle={t('healthProbe.probe.subtitle')}
                action={<Switch checked={probeEnabled} onCheckedChange={handleProbeChange} />}
            >
                {probeFields.map(renderFieldCard)}
                {probeSwitchFields.map(renderSwitchCard)}
            </SectionShell>
        </div>
    );
}
export { SettingHealthProbe as SettingHealth };
