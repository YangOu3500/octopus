'use client';

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
    value: string;
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
}

export function CopyButton({ value, className, size = "icon" }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    return (
        <Button
            type="button"
            variant="ghost"
            size={size}
            className={cn("h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 p-0", className)}
            onClick={handleCopy}
        >
            {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
                <Copy className="h-3.5 w-3.5" />
            )}
        </Button>
    );
}
