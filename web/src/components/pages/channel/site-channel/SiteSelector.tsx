'use client';

import { useMemo } from 'react';
import { Globe, User } from 'lucide-react';
import { type SiteChannelCard } from '@/api/endpoints/site-channel';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface SiteSelectorProps {
    cards: SiteChannelCard[];
    selectedSiteId: number | null;
    selectedAccountId: number | null;
    onSelect: (siteId: number, accountId: number) => void;
}

export function SiteSelector({
    cards,
    selectedSiteId,
    selectedAccountId,
    onSelect
}: SiteSelectorProps) {
    const activeCard = useMemo(() => {
        return cards.find((c) => c.site_id === selectedSiteId) ?? null;
    }, [cards, selectedSiteId]);

    const handleSiteChange = (siteIdStr: string) => {
        const siteId = Number(siteIdStr);
        const card = cards.find((c) => c.site_id === siteId);
        if (card && card.accounts.length > 0) {
            onSelect(siteId, card.accounts[0].account_id);
        }
    };

    const handleAccountChange = (accountIdStr: string) => {
        if (selectedSiteId) {
            onSelect(selectedSiteId, Number(accountIdStr));
        }
    };

    return (
        <div className="grid gap-4 md:grid-cols-2 rounded-xl border border-border bg-muted/20 p-4">
            <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <Globe className="size-3.5" /> 选择站点
                </span>
                <Select
                    value={selectedSiteId ? String(selectedSiteId) : ''}
                    onValueChange={handleSiteChange}
                >
                    <SelectTrigger className="h-9 rounded-lg text-xs bg-background">
                        <SelectValue placeholder="选择站点..." />
                    </SelectTrigger>
                    <SelectContent>
                        {cards.map((card) => (
                            <SelectItem key={card.site_id} value={String(card.site_id)} className="text-xs">
                                {card.site_name} ({card.platform})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <User className="size-3.5" /> 选择同步账号
                </span>
                <Select
                    value={selectedAccountId ? String(selectedAccountId) : ''}
                    onValueChange={handleAccountChange}
                    disabled={!activeCard || activeCard.accounts.length === 0}
                >
                    <SelectTrigger className="h-9 rounded-lg text-xs bg-background">
                        <SelectValue placeholder={activeCard ? "选择账号..." : "先选择站点"} />
                    </SelectTrigger>
                    <SelectContent>
                        {activeCard?.accounts.map((acc) => (
                            <SelectItem key={acc.account_id} value={String(acc.account_id)} className="text-xs">
                                {acc.account_name} ({acc.group_count} 分组 / {acc.model_count} 模型)
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
