import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Hash, Lock, Pencil } from "lucide-react";
import { NavLink } from "react-router";

import { EmptyState } from "@/components/layout/empty-state";
import {
  NAV_ROW_LANE,
  navMarker,
  navRow,
} from "@/components/layout/nav-styles";
import { Skeleton } from "@/components/ui/skeleton";
import { TruncatedControl } from "@/components/ui/truncated";
import {
  type ChannelListEntry,
  serverChannelsQuery,
  useRequestedChannelId,
} from "@/features/channels/api/queries";
import { UnreadBadge } from "@/features/channels/components/unread-badge";
import { useReorderChannels } from "@/features/channels/hooks/use-reorder-channels";
import { usePrefetchChannel } from "@/features/channels/lib/load-view";
import { badgeCount } from "@/features/channels/lib/unread";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { cn } from "@/lib/cn";
import { releaseAfterPointer } from "@/lib/pointer-focus";
import { useClipped } from "@/lib/use-clipped";
import { useUi } from "@/stores/ui";

const ROW_CONTROL = cn(
  "flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity",
  "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
  "group-focus-within/channel:opacity-100 group-hover/channel:opacity-100 aria-pressed:opacity-100",
);

function ChannelRow({
  active,
  channel,
  manageable,
}: {
  active: boolean;
  channel: ChannelListEntry;
  manageable: boolean;
}) {
  const name = channel.name ?? "channel";
  const prefetch = usePrefetchChannel();
  const openChannelSettings = useUi((state) => state.openChannelSettings);
  const { clipped, ref } = useClipped<HTMLSpanElement>();

  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: channel.id, disabled: !manageable });

  return (
    <li
      className={cn("group/channel relative", isDragging && "z-10 opacity-80")}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <TruncatedControl clipped={clipped} value={`#${name}`}>
        <NavLink
          className={cn(navRow(active), "gap-2 pr-1 pl-3")}
          onFocus={() => {
            prefetch(channel.id);
          }}
          onPointerEnter={() => {
            prefetch(channel.id);
          }}
          to={`/app/channels/${channel.id}`}
          {...(active ? { "aria-current": "page" as const } : {})}
        >
          <span aria-hidden className={navMarker(active)} />
          <Hash
            aria-hidden
            className={cn(
              "size-[1.125rem] shrink-0",
              active ? "text-brand" : "text-muted-foreground/70",
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              (channel.hasUnread || badgeCount(channel) > 0) &&
                !active &&
                "font-semibold text-foreground",
            )}
            ref={ref}
          >
            {name}
          </span>

          <span
            data-testid={`channel-unread-${channel.id}`}
            className={cn(
              NAV_ROW_LANE,
              "flex shrink-0 items-center justify-center transition-opacity",
              manageable &&
                "group-focus-within/channel:opacity-0 group-hover/channel:opacity-0",
            )}
          >
            <UnreadBadge className="ml-0" label={name} state={channel} />
          </span>
        </NavLink>
      </TruncatedControl>

      {manageable ? (
        <span
          className={cn(
            "absolute top-1/2 right-1 flex -translate-y-1/2 items-center justify-center gap-0.5",
            NAV_ROW_LANE,
          )}
        >
          <button
            aria-label={`Edit ${name}`}
            className={ROW_CONTROL}
            onClick={(event) => {
              openChannelSettings(channel.id);
              releaseAfterPointer(event);
            }}
            type="button"
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>

          <button
            aria-label={`Reorder ${name}`}
            className={cn(ROW_CONTROL, isDragging && "opacity-100")}
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        </span>
      ) : null}
    </li>
  );
}

export function ChannelList({ serverId }: { serverId: string | undefined }) {
  const activeChannelId = useRequestedChannelId();
  const permissions = useServerPermissions(serverId);
  const { reorder } = useReorderChannels(serverId ?? "");

  const { data, isPending, isError } = useQuery({
    ...serverChannelsQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  const manageable =
    serverId !== undefined && has(permissions, Permissions.MANAGE_CHANNELS);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (serverId === undefined || isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-1.5 p-2">
        {["a", "b", "c", "d", "e"].map((key, index) => (
          <Skeleton
            className="h-10 rounded-lg"
            key={key}
            style={{ opacity: 1 - index * 0.15 }}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-body text-muted-foreground" role="alert">
        Could not load channels.
      </p>
    );
  }

  if (data.length === 0) {
    return manageable ? (
      <EmptyState
        description="Somebody with permission can add the first one."
        icon={<Hash aria-hidden className="size-5" />}
        title="No channels yet"
      />
    ) : (
      <EmptyState
        description="Ask somebody who runs this server if that looks wrong."
        icon={<Lock aria-hidden className="size-5" />}
        title="You don't have access to any channels in this server"
      />
    );
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over === null || active.id === over.id) {
      return;
    }

    const from = data.findIndex((channel) => channel.id === active.id);
    const to = data.findIndex((channel) => channel.id === over.id);

    if (from === -1 || to === -1) {
      return;
    }

    reorder(arrayMove(data, from, to).map((channel) => channel.id));
  };

  const rows = data.map((channel) => (
    <ChannelRow
      active={channel.id === activeChannelId}
      channel={channel}
      key={channel.id}
      manageable={manageable}
    />
  ));

  if (!manageable) {
    return (
      <div className="p-2">
        <Heading />
        <ul className="flex flex-col gap-0.5">{rows}</ul>
      </div>
    );
  }

  return (
    <div className="p-2">
      <Heading />
      <DndContext
        accessibility={{
          announcements: announcementsFor(data),
          screenReaderInstructions: INSTRUCTIONS,
        }}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={data.map((channel) => channel.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-0.5">{rows}</ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function announcementsFor(
  channels: readonly ChannelListEntry[],
): Announcements {
  const nameOf = (id: string | number) =>
    channels.find((channel) => channel.id === id)?.name ?? "channel";

  const positionOf = (id: string | number) =>
    channels.findIndex((channel) => channel.id === id) + 1;

  const total = String(channels.length);

  return {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, ${String(positionOf(active.id))} of ${total}.`,
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : `${nameOf(active.id)} is over position ${String(positionOf(over.id))} of ${total}.`,
    onDragEnd: ({ active, over }) =>
      over === null
        ? `${nameOf(active.id)} was dropped where it started.`
        : `${nameOf(active.id)} was moved to position ${String(positionOf(over.id))} of ${total}.`,
    onDragCancel: ({ active }) =>
      `Moving ${nameOf(active.id)} was cancelled. It is back where it started.`,
  };
}

const INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Press space to pick this channel up. Use the arrow keys to move it, space to drop it, and escape to leave it where it was.",
};

function Heading() {
  return (
    <p className="px-3 pt-1.5 pb-2 text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase">
      Text channels
    </p>
  );
}
