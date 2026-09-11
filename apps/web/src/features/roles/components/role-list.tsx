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
import { GripVertical } from "lucide-react";

import {
  roleColor,
  type ServerRoleSummary,
} from "@/features/roles/api/queries";
import { useReorderRoles } from "@/features/roles/hooks/use-reorder-roles";
import { cn } from "@/lib/cn";

function RoleRow({
  draggable,
  gutter,
  onSelect,
  role,
  selected,
}: {
  draggable: boolean;
  gutter: boolean;
  onSelect: (roleId: string) => void;
  role: ServerRoleSummary;
  selected: boolean;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: role.id, disabled: !draggable });

  const pill = (
    <li
      className={cn(
        "group/role relative flex items-stretch rounded-lg text-sm transition-colors",
        "hover:bg-muted",
        selected && "bg-muted font-medium",
        isDragging && "z-10 bg-muted opacity-90 shadow-e1",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left",
          "rounded-l-lg focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
          gutter ? "pr-1" : "rounded-r-lg pr-2",
        )}
        onClick={() => {
          onSelect(role.id);
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-current"
          style={{ color: roleColor(role) ?? "currentColor" }}
        />
        <span className="min-w-0 flex-1 truncate text-left">{role.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {role.memberCount}
        </span>
      </button>

      {gutter ? (
        draggable ? (
          <button
            aria-label={`Reorder ${role.name}`}
            className={cn(
              "flex w-7 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground",
              "opacity-0 transition-opacity group-focus-within/role:opacity-100 group-hover/role:opacity-100",
              "hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              "cursor-grab active:cursor-grabbing",
              isDragging && "text-foreground opacity-100",
            )}
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-3.5" />
          </button>
        ) : (
          <span aria-hidden className="w-7 shrink-0" />
        )
      ) : null}
    </li>
  );

  return pill;
}

export function RoleList({
  actorPosition,
  mayManage,
  onSelect,
  roles,
  shown,
  selectedId,
  serverId,
}: {
  actorPosition: number;
  mayManage: boolean;
  onSelect: (roleId: string) => void;
  roles: ServerRoleSummary[];
  shown: ServerRoleSummary[];
  selectedId: string | null;
  serverId: string;
}) {
  const { reorder } = useReorderRoles(serverId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const movable = (role: ServerRoleSummary) =>
    mayManage && !role.isDefault && role.position < actorPosition;

  const filtered = shown.length !== roles.length;

  const block = filtered ? [] : roles.filter(movable);
  const first = filtered ? -1 : roles.findIndex(movable);
  const above = first === -1 ? shown : roles.slice(0, first);
  const below = first === -1 ? [] : roles.slice(first + block.length);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over === null || active.id === over.id) {
      return;
    }

    const from = block.findIndex((role) => role.id === active.id);
    const to = block.findIndex((role) => role.id === over.id);

    if (from === -1 || to === -1) {
      return;
    }

    reorder(arrayMove(block, from, to).map((role) => role.id));
  };

  const row = (role: ServerRoleSummary) => (
    <RoleRow
      draggable={!filtered && movable(role)}
      gutter={block.length > 0}
      key={role.id}
      onSelect={onSelect}
      role={role}
      selected={role.id === selectedId}
    />
  );

  if (block.length === 0) {
    return (
      <ul aria-label="Roles" className="flex flex-col gap-0.5">
        {shown.map(row)}
      </ul>
    );
  }

  return (
    <DndContext
      accessibility={{
        announcements: announcementsFor(block),
        screenReaderInstructions: INSTRUCTIONS,
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <ul aria-label="Roles" className="flex flex-col gap-0.5">
        {above.map(row)}
        <SortableContext
          items={block.map((role) => role.id)}
          strategy={verticalListSortingStrategy}
        >
          {block.map(row)}
        </SortableContext>
        {below.map(row)}
      </ul>
    </DndContext>
  );
}

function announcementsFor(block: readonly ServerRoleSummary[]): Announcements {
  const nameOf = (id: string | number) =>
    block.find((role) => role.id === id)?.name ?? "role";

  const positionOfId = (id: string | number) =>
    block.findIndex((role) => role.id === id) + 1;

  const total = String(block.length);

  return {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, ${String(positionOfId(active.id))} of ${total}.`,
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : `${nameOf(active.id)} is over position ${String(positionOfId(over.id))} of ${total}.`,
    onDragEnd: ({ active, over }) =>
      over === null
        ? `${nameOf(active.id)} was dropped where it started.`
        : `${nameOf(active.id)} was moved to position ${String(positionOfId(over.id))} of ${total}.`,
    onDragCancel: ({ active }) =>
      `Moving ${nameOf(active.id)} was cancelled. It is back where it started.`,
  };
}

const INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Press space to pick this role up. Use the arrow keys to move it, space to drop it, and escape to leave it where it was.",
};
