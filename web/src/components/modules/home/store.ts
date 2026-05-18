'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type RankSortMode = 'cost' | 'count' | 'tokens';
export type ChartPeriod = '1' | '7' | '30' | 'all';
export type HomeSectionId = 'workbench' | 'analytics' | 'activity';

interface HomeViewState {
    rankSortMode: RankSortMode;
    chartPeriod: ChartPeriod;
    openSections: HomeSectionId[];
    setRankSortMode: (value: RankSortMode) => void;
    setChartPeriod: (value: ChartPeriod) => void;
    setOpenSections: (value: HomeSectionId[]) => void;
}

export const useHomeViewStore = create<HomeViewState>()(
    persist(
        (set) => ({
            rankSortMode: 'cost',
            chartPeriod: '7',
            openSections: ['workbench', 'analytics', 'activity'],
            setRankSortMode: (value) => set({ rankSortMode: value }),
            setChartPeriod: (value) => set({ chartPeriod: value }),
            setOpenSections: (value) => set({ openSections: value }),
        }),
        {
            name: 'home-view-options-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                rankSortMode: state.rankSortMode,
                chartPeriod: state.chartPeriod,
                openSections: state.openSections,
            }),
        }
    )
);
