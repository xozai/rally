import { Badge } from "./ui/badge";

type EventStatus = "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";

export function StatusBadge({ status }: { status: EventStatus }) {
  const color =
    status === "CONFIRMED"
      ? "border-primary/30 bg-primary/10 text-primary"
      : status === "VOTING"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-border bg-white text-foreground";

  return <Badge className={color}>{status}</Badge>;
}
