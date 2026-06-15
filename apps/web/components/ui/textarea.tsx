import * as React from "react";
import { cn } from "../../lib/utils";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-primary/20 transition-shadow placeholder:text-muted-foreground focus:ring-4",
        props.className
      )}
    />
  );
}
