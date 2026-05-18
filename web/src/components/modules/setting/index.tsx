'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageWrapper } from '@/components/common/PageWrapper';
import { cn } from '@/lib/utils';
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

type SettingSectionId =
    | 'system'
    | 'health'
    | 'automation'
    | 'association'
    | 'fusion'
    | 'maintenance';

type SettingSection = {
    id: SettingSectionId;
    label: string;
    content: ReactNode;
};

const DEFAULT_SECTION: SettingSectionId = 'system';
const STORAGE_KEY = 'setting-active-section';

function SectionNav({
    sections,
    activeSection,
    onSelect,
}: {
    sections: SettingSection[];
    activeSection: SettingSectionId;
    onSelect: (section: SettingSectionId) => void;
}) {
    return (
        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="md:hidden">
                <Select value={activeSection} onValueChange={(value) => onSelect(value as SettingSectionId)}>
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

            <nav className="hidden md:flex md:flex-col md:gap-1">
                {sections.map((section) => {
                    const isActive = section.id === activeSection;
                    return (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => onSelect(section.id)}
                            className={cn(
                                'rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                                isActive
                                    ? 'border border-primary/20 bg-primary/10 text-foreground shadow-sm'
                                    : 'border border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                            )}
                        >
                            {section.label}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

function SectionContent({ section }: { section: SettingSection }) {
    return (
        <section className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
            </div>
            <div className="space-y-4">{section.content}</div>
        </section>
    );
}

export function Setting() {
    const sectionT = useTranslations('setting.sections');
    const [activeSection, setActiveSection] = useState<SettingSectionId>(() => {
        if (typeof window === 'undefined') {
            return DEFAULT_SECTION;
        }
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'system' || stored === 'health' || stored === 'automation' || stored === 'association' || stored === 'fusion' || stored === 'maintenance') {
            return stored;
        }
        return DEFAULT_SECTION;
    });

    const handleSelectSection = (section: SettingSectionId) => {
        setActiveSection(section);
        window.localStorage.setItem(STORAGE_KEY, section);
    };

    const sections = useMemo<SettingSection[]>(
        () => [
            {
                id: 'system',
                label: sectionT('system'),
                content: (
                    <>
                        <SettingSystem />
                        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                            <SettingCircuitBreaker />
                            <SettingLog />
                        </div>
                    </>
                ),
            },
            {
                id: 'health',
                label: sectionT('health'),
                content: <SettingHealthProbe />,
            },
            {
                id: 'automation',
                label: sectionT('automation'),
                content: (
                    <>
                        <SettingSiteAutomation />
                        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
                            <SettingAPIKey />
                            <SettingLLMPrice />
                            <SettingLLMSync />
                        </div>
                    </>
                ),
            },
            {
                id: 'association',
                label: sectionT('association'),
                content: <SettingModelAssociation />,
            },
            {
                id: 'fusion',
                label: sectionT('fusion'),
                content: <SettingFusionCapabilities />,
            },
            {
                id: 'maintenance',
                label: sectionT('maintenance'),
                content: (
                    <>
                        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                            <SettingAppearance />
                            <SettingAccount />
                        </div>
                        <SettingBackup />
                        <SettingInfo />
                    </>
                ),
            },
        ],
        [sectionT]
    );

    const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];

    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <PageWrapper
                childLayout={false}
                className="grid grid-cols-1 gap-4 pb-24 md:pb-4 xl:grid-cols-[14.5rem_minmax(0,1fr)]"
            >
                <aside className="xl:sticky xl:top-3 xl:self-start">
                    <SectionNav
                        sections={sections}
                        activeSection={currentSection.id}
                        onSelect={handleSelectSection}
                    />
                </aside>

                <SectionContent section={currentSection} />
            </PageWrapper>
        </div>
    );
}
