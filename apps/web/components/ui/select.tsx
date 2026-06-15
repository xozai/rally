import * as React from "react";
import { cn } from "../../lib/utils";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none ring-primary/20 transition-shadow focus:ring-4",
        props.className
      )}
    />
  );
}
