'use client';

import { useMemo, useState } from 'react';
import { GroupCard } from './Card';
import { useGroupList } from '@/api/endpoints/group';
import { useSearchStore, useToolbarViewOptionsStore } from '@/components/modules/toolbar';
import { VirtualizedGrid } from '@/components/common/VirtualizedGrid';
import { GroupBulkGenerateDialog } from './BulkGenerate';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List } from 'lucide-react';

export function Group() {
    const { data: groups } = useGroupList();
    const pageKey = 'group' as const;
    const searchTerm = useSearchStore((s) => s.getSearchTerm(pageKey));
    const sortField = useToolbarViewOptionsStore((s) => s.getSortField(pageKey));
    const sortOrder = useToolbarViewOptionsStore((s) => s.getSortOrder(pageKey));
    const filter = useToolbarViewOptionsStore((s) => s.groupFilter);
    const [viewMode, setViewMode] = useState<'list' | 'card'>('card');

    const sortedGroups = useMemo(() => {
        if (!groups) return [];
        return [...groups].sort((a, b) => {
            const diff = sortField === 'name'
                ? a.name.localeCompare(b.name)
                : (a.id || 0) - (b.id || 0);
            return sortOrder === 'asc' ? diff : -diff;
        });
    }, [groups, sortField, sortOrder]);

    const visibleGroups = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        const byName = !term ? sortedGroups : sortedGroups.filter((g) => g.name.toLowerCase().includes(term));

        if (filter === 'with-members') return byName.filter((g) => (g.items?.length || 0) > 0);
        if (filter === 'empty') return byName.filter((g) => (g.items?.length || 0) === 0);

        return byName;
    }, [sortedGroups, searchTerm, filter]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex shrink-0 items-center justify-between gap-3">
                <div className="flex items-center gap-1 border border-border/40 rounded-lg p-1 bg-muted/30">
                    <Button
                        type="button"
                        variant={viewMode === 'list' ? 'default' : 'ghost'}
                        size="icon-sm"
                        className="h-7 w-7 rounded-md"
                        onClick={() => setViewMode('list')}
                    >
                        <List className="size-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant={viewMode === 'card' ? 'default' : 'ghost'}
                        size="icon-sm"
                        className="h-7 w-7 rounded-md"
                        onClick={() => setViewMode('card')}
                    >
                        <LayoutGrid className="size-3.5" />
                    </Button>
                </div>
                <GroupBulkGenerateDialog />
            </div>
            <div className="min-h-0 flex-1">
                <VirtualizedGrid
                    items={visibleGroups}
                    columns={viewMode === 'card' ? { default: 1, sm: 2, lg: 3, xl: 4 } : { default: 1, xl: 2 }}
                    estimateItemHeight={viewMode === 'card' ? 220 : 580}
                    getItemKey={(group, index) => group.id ?? `group-${index}`}
                    renderItem={(group) => <GroupCard group={group} viewMode={viewMode} />}
                />
            </div>
        </div>
    );
}
