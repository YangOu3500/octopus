'use client';

import { useNavStore, type NavItem } from "@/stores/nav";
import { ROUTES } from "@/route/config";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function MobileNav() {
    const t = useTranslations('navbar');
    const { activeItem, setActiveItem } = useNavStore();

    return (
        <nav 
            aria-label="Mobile Navigation"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 text-card-foreground shadow-lg backdrop-blur-md md:hidden max-w-[90vw] overflow-x-auto scrollbar-none"
        >
            {ROUTES.map((route) => {
                const isActive = activeItem === route.id;
                return (
                    <button
                        key={route.id}
                        type="button"
                        onClick={() => setActiveItem(route.id as NavItem)}
                        title={t(route.id)}
                        className={cn(
                            "flex items-center justify-center h-9 w-9 rounded-xl transition-all outline-none",
                            isActive
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        <route.icon className="h-4 w-4 shrink-0" />
                    </button>
                );
            })}
        </nav>
    );
}
