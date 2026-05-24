import { Moon, Sun, Languages, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSettingStore } from '@/stores/setting';
import { useNavStore } from '@/components/modules/navbar';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export function GlobalActions() {
    const { theme, setTheme } = useTheme();
    const { locale, setLocale } = useSettingStore();
    const { setActiveItem, activeItem } = useNavStore();

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
    const toggleLocale = () => setLocale(locale === 'en' ? 'zh_hans' : 'en');

    return (
        <div className="flex items-center gap-1.5 ml-2">
            <button
                type="button"
                onClick={() => setActiveItem('setting')}
                title="Settings"
                className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    "rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                    activeItem === 'setting' && "bg-muted text-foreground"
                )}
            >
                <Settings className="size-4" />
            </button>
            <button
                type="button"
                onClick={toggleLocale}
                title="Switch Language"
                className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    "rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                )}
            >
                <Languages className="size-4" />
            </button>
            <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    "rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                )}
            >
                {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
        </div>
    );
}
