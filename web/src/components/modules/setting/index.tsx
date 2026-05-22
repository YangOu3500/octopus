'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { ArchiveRestore, Bot, HeartPulse, Settings2, Sparkles, Workflow, type LucideIcon } from 'lucide-react';
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
    icon: LucideIcon;
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
        <section className="sticky top-3 z-10 rounded-lg border border-border/70 bg-card/95 p-2.5 shadow-sm backdrop-blur">
            <div className="md:hidden">
                <Select value={activeSection} onValueChange={(value) => onSelect(value as SettingSectionId)}>
                    <SelectTrigger className="h-9 rounded-md">
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

            <nav className="hidden md:block">
                <div className="space-y-1.5">
                    {sections.map((section) => {
                        const isActive = section.id === activeSection;
                        const Icon = section.icon;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => onSelect(section.id)}
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2.5 text-left text-sm font-medium transition-all',
                                    isActive
                                        ? 'border-primary/20 bg-primary/10 text-foreground shadow-sm'
                                        : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/20 hover:bg-background hover:text-foreground'
                                )}
                            >
                                <span
                                    className={cn(
                                        'flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                                        isActive
                                            ? 'border-primary/20 bg-background text-primary'
                                            : 'border-border/60 bg-card text-muted-foreground'
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" />
                                </span>
                                <span className="min-w-0 truncate">{section.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </section>
    );
}

function SectionContent({ section }: { section: SettingSection }) {
    return (
        <section className="space-y-3 rounded-lg border border-border/70 bg-card/40 p-2.5 md:p-3.5">
            {section.content}
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
                icon: Settings2,
                label: sectionT('system'),
                content: (
                    <>
                        <SettingSystem />
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <SettingCircuitBreaker />
                            <SettingLog />
                        </div>
                    </>
                ),
            },
            {
                id: 'health',
                icon: HeartPulse,
                label: sectionT('health'),
                content: <SettingHealthProbe />,
            },
            {
                id: 'automation',
                icon: Bot,
                label: sectionT('automation'),
                content: (
                    <>
                        <SettingSiteAutomation />
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            <SettingAPIKey />
                            <SettingLLMPrice />
                            <SettingLLMSync />
                        </div>
                    </>
                ),
            },
            {
                id: 'association',
                icon: Workflow,
                label: sectionT('association'),
                content: <SettingModelAssociation />,
            },
            {
                id: 'fusion',
                icon: Sparkles,
                label: sectionT('fusion'),
                content: <SettingFusionCapabilities />,
            },
            {
                id: 'maintenance',
                icon: ArchiveRestore,
                label: sectionT('maintenance'),
                content: (
                    <>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
            <PageWrapper childLayout={false} className="pb-24 md:pb-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[192px_minmax(0,1fr)]">
                    <SectionNav
                        sections={sections}
                        activeSection={currentSection.id}
                        onSelect={handleSelectSection}
                    />
                    <SectionContent section={currentSection} />
                </div>
            </PageWrapper>
        </div>
    );
}
