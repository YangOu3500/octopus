'use client';

import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';

interface AppShellProps {
    children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground select-none">
            {/* Sidebar layout for Desktop viewports */}
            <Sidebar />

            {/* Main content window */}
            <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
                <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
                    {children}
                </main>
            </div>

            {/* Floating dock menu for Mobile viewports */}
            <MobileNav />
        </div>
    );
}
