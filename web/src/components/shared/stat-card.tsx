import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    value: string | number;
    icon?: LucideIcon;
    description?: string;
    trend?: {
        value: string;
        direction: 'up' | 'down' | 'neutral';
    };
    className?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend, className }: StatCardProps) {
    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{title}</span>
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-2xl font-bold tracking-tight font-mono">{value}</span>
                    {(description || trend) && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {trend && (
                                <span className={cn(
                                    "font-semibold",
                                    trend.direction === 'up' && "text-emerald-500",
                                    trend.direction === 'down' && "text-rose-500"
                                )}>
                                    {trend.direction === 'up' && "↑"}
                                    {trend.direction === 'down' && "↓"}
                                    {trend.value}
                                </span>
                            )}
                            {description && <span>{description}</span>}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
