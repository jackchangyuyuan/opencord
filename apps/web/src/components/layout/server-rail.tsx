import { ScrollArea } from "@/components/ui/scroll-area";

const PLACEHOLDERS = ["one", "two", "three"];

export function ServerRail() {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3">
      <h2 className="sr-only">Servers</h2>
      <ScrollArea className="w-full flex-1">
        <ul className="flex flex-col items-center gap-2 px-3">
          {PLACEHOLDERS.map((key) => (
            <li key={key}>
              <div className="size-10 animate-pulse rounded-2xl bg-muted" />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
