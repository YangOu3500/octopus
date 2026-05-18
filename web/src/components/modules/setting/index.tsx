'use client';

import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/common/PageWrapper';
import { SettingAppearance } from './Appearance';
import { SettingSystem } from './System';
import { SettingAPIKey } from './APIKey';
import { SettingLLMPrice } from './LLMPrice';
import { SettingAccount } from './Account';
import { SettingInfo } from './Info';
import { SettingLLMSync } from './LLMSync';
import { SettingSiteAutomation } from './SiteAutomation';
import { SettingLog } from './Log';
import { SettingBackup } from './Backup';
import { SettingCircuitBreaker } from './CircuitBreaker';
import { SettingHealthProbe } from './HealthProbe';
import { SettingFusionCapabilities } from './FusionCapabilities';
import { SettingModelAssociation } from './ModelAssociation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SettingSection = {
    id: string;
    label: string;
};

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionNav({
    sections,
}: {
    sections: SettingSection[];
}) {
    return (
        <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="md:hidden">
                <Select defaultValue={sections[0]?.id} onValueChange={scrollToSection}>
                    <SelectTrigger className="h-10 rounded-lg">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {sections.map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                                {section.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="hidden md:block xl:hidden">
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            className="shrink-0 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted hover:text-foreground"
                            onClick={() => scrollToSection(section.id)}
                        >
                            {section.label}
                        </button>
                    ))}
                </div>
            </div>

            <nav className="hidden xl:flex xl:flex-col xl:gap-1">
                {sections.map((section) => (
                    <button
                        key={section.id}
                        type="button"
                        className={cn(
                            'rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        )}
                        onClick={() => scrollToSection(section.id)}
                    >
                        {section.label}
                    </button>
                ))}
            </nav>
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return <h2 className="text-sm font-semibold text-foreground">{title}</h2>;
}

export function Setting() {
    const sectionT = useTranslations('setting.sections');
    const sections = [
        { id: 'setting-system', label: sectionT('system') },
        { id: 'setting-health', label: sectionT('health') },
        { id: 'setting-automation', label: sectionT('automation') },
        { id: 'setting-model-association', label: sectionT('association') },
        { id: 'setting-fusion-capabilities', label: sectionT('fusion') },
        { id: 'setting-maintenance', label: sectionT('maintenance') },
    ];

    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <PageWrapper
                childLayout={false}
                className="grid grid-cols-1 gap-4 pb-24 md:pb-4 xl:grid-cols-[13.5rem_minmax(0,1fr)]"
            >
                <aside className="xl:sticky xl:top-3 xl:self-start">
                    <SectionNav sections={sections} />
                </aside>

                <div className="space-y-5">
                    <section id="setting-system" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('system')} />
                        <SettingSystem />
                        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                            <SettingCircuitBreaker />
                            <SettingLog />
                        </div>
                    </section>

                    <section id="setting-health" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('health')} />
                        <SettingHealthProbe />
                    </section>

                    <section id="setting-automation" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('automation')} />
                        <SettingSiteAutomation />
                        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-3">
                            <SettingAPIKey />
                            <SettingLLMPrice />
                            <SettingLLMSync />
                        </div>
                    </section>

                    <section id="setting-model-association" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('association')} />
                        <SettingModelAssociation />
                    </section>

                    <section id="setting-fusion-capabilities" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('fusion')} />
                        <SettingFusionCapabilities />
                    </section>

                    <section id="setting-maintenance" className="scroll-mt-24 space-y-3">
                        <SectionHeader title={sectionT('maintenance')} />
                        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                            <SettingAppearance />
                            <SettingAccount />
                        </div>
                        <SettingBackup />
                        <SettingInfo />
                    </section>
                </div>
            </PageWrapper>
        </div>
    );
}
