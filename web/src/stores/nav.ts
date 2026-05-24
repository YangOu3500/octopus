import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type NavItem = 'home' | 'site' | 'channel' | 'modelHealth' | 'modelTest' | 'group' | 'model' | 'traces' | 'log' | 'setting'

export const NAV_ORDER: NavItem[] = ['home', 'site', 'channel', 'modelHealth', 'modelTest', 'group', 'model', 'traces', 'log', 'setting']

export type LogNavigationTarget = {
    logId?: number
    traceId?: string
    source?: string
    nonce: number
}

interface NavState {
    activeItem: NavItem
    sidebarExpanded: boolean
    pendingLogTarget: LogNavigationTarget | null
    setActiveItem: (item: NavItem) => void
    setSidebarExpanded: (expanded: boolean) => void
    toggleSidebarExpanded: () => void
    openLogTarget: (target: Omit<LogNavigationTarget, 'nonce'>) => void
    clearLogTarget: (nonce?: number) => void
}

export const useNavStore = create<NavState>()(
    persist(
        (set, get) => ({
            activeItem: 'home',
            sidebarExpanded: true,
            pendingLogTarget: null,
            setActiveItem: (item) => {
                set({ activeItem: item })
            },
            setSidebarExpanded: (expanded) => {
                set({ sidebarExpanded: expanded })
            },
            toggleSidebarExpanded: () => {
                set((state) => ({ sidebarExpanded: !state.sidebarExpanded }))
            },
            openLogTarget: (target) => {
                set({
                    activeItem: 'log',
                    pendingLogTarget: {
                        ...target,
                        nonce: Date.now(),
                    },
                })
            },
            clearLogTarget: (nonce) => {
                const { pendingLogTarget } = get()
                if (nonce !== undefined && pendingLogTarget?.nonce !== nonce) return
                set({ pendingLogTarget: null })
            },
        }),
        {
            name: 'nav-storage',
            version: 4,
            storage: createJSONStorage(() => localStorage),
            migrate: (persistedState) => {
                const state = (persistedState ?? {}) as Partial<NavState>
                return {
                    activeItem: NAV_ORDER.includes(state.activeItem as NavItem) ? state.activeItem : 'home',
                    sidebarExpanded: true,
                    pendingLogTarget: state.pendingLogTarget ?? null,
                } as NavState
            },
            partialize: (state) => ({
                activeItem: state.activeItem,
                sidebarExpanded: state.sidebarExpanded,
                pendingLogTarget: state.pendingLogTarget,
            }),
        }
    )
)
