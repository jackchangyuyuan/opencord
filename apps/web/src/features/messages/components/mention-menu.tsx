import { Hash, Megaphone, Shield } from "lucide-react";
import type { ReactNode } from "react";

import {
  type MentionCandidate,
  mentionOptionId,
} from "@/features/messages/lib/mentions";
import { roleColor } from "@/features/roles/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { cn } from "@/lib/cn";

const BROADCAST_COPY = {
  everyone: "Notify everybody who can read this channel",
  here: "Notify everybody who is online here",
} as const;

function Glyph({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand"
      style={tone === undefined ? undefined : { color: tone }}
    >
      {children}
    </span>
  );
}

function Lines({
  detail,
  selected,
  title,
  tone,
}: {
  detail: string;
  selected: boolean;
  title: string;
  tone?: string | undefined;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className="block truncate text-body font-semibold"
        style={tone === undefined ? undefined : { color: tone }}
      >
        {title}
      </span>
      <span
        className={cn(
          "block truncate text-meta",
          selected ? "text-accent-foreground" : "text-muted-foreground",
        )}
      >
        {detail}
      </span>
    </span>
  );
}

export function MentionMenu({
  listId,
  candidates,
  highlighted,
  onHighlight,
  onPick,
  side = "top",
}: {
  listId: string;
  candidates: readonly MentionCandidate[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (candidate: MentionCandidate) => void;
  side?: "top" | "bottom";
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-0 z-30 w-full max-w-md overflow-hidden rounded-2xl border bg-popover shadow-e3",
        side === "top" ? "bottom-full mb-2" : "top-full mt-2",
      )}
    >
      <p className="border-b px-4 py-2 text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {candidates[0]?.kind === "channel" ? "Channel" : "Mention"}
      </p>
      <ul aria-label="Mentions" className="p-1.5" id={listId} role="listbox">
        {candidates.map((candidate, index) => {
          const selected = index === highlighted;

          return (
            <li
              aria-selected={selected}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2",
                selected && "bg-accent text-accent-foreground",
              )}
              id={mentionOptionId(listId, candidate.key)}
              key={candidate.key}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(candidate);
              }}
              onMouseEnter={() => {
                onHighlight(index);
              }}
              role="option"
            >
              {candidate.kind === "broadcast" ? (
                <>
                  <Glyph>
                    <Megaphone className="size-[1.125rem]" />
                  </Glyph>
                  <Lines
                    detail={BROADCAST_COPY[candidate.token]}
                    selected={selected}
                    title={`@${candidate.token}`}
                  />
                </>
              ) : candidate.kind === "role" ? (
                <>
                  <Glyph tone={roleColor(candidate.role)}>
                    <Shield className="size-[1.125rem]" />
                  </Glyph>
                  <Lines
                    detail="Notify everybody with this role"
                    selected={selected}
                    title={`@${candidate.role.name}`}
                    tone={selected ? undefined : roleColor(candidate.role)}
                  />
                </>
              ) : candidate.kind === "channel" ? (
                <>
                  <Glyph>
                    <Hash className="size-[1.125rem]" />
                  </Glyph>
                  <Lines
                    detail={candidate.channel.topic ?? "Link to this channel"}
                    selected={selected}
                    title={`#${candidate.channel.name ?? ""}`}
                  />
                </>
              ) : (
                <>
                  <UserAvatar
                    avatarUrl={candidate.user.avatarUrl}
                    name={candidate.user.name}
                    ring="ring-popover"
                    size="sm"
                    userId={candidate.user.id}
                  />
                  <span className="min-w-0 flex-1 truncate text-body">
                    {candidate.user.name}
                  </span>

                  <span
                    className={cn(
                      "max-w-[45%] shrink-0 truncate text-meta",
                      selected
                        ? "text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    @{candidate.user.username}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
