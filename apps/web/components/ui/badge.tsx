import * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-border bg-white px-2.5 text-xs font-medium text-foreground",
        className
      )}
      {...props}
    />
  );
}
