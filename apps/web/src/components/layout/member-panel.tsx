import { ScrollArea } from "@/components/ui/scroll-area";

const PLACEHOLDERS = ["ada", "grace", "alan", "katherine"];

export function MemberPanel() {
  return (
    <aside
      aria-labelledby="member-panel-heading"
      className="hidden w-56 shrink-0 flex-col border-l bg-sidebar lg:flex"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold" id="member-panel-heading">
          Members
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-2 p-3">
          {PLACEHOLDERS.map((key) => (
            <li className="flex items-center gap-2" key={key}>
              <div className="size-7 animate-pulse rounded-full bg-muted" />
              <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
