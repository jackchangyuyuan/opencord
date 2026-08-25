import { ScrollArea } from "@/components/ui/scroll-area";

const PLACEHOLDERS = ["general", "random", "engineering", "design"];

export function ChannelSidebar() {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Channels</h2>
      </div>
      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-1 p-2">
          {PLACEHOLDERS.map((key) => (
            <li key={key}>
              <div className="h-7 animate-pulse rounded-lg bg-muted" />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
