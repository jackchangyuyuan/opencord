import { Button } from "@/components/ui/button";
import { PresenceDot } from "@/features/members/components/presence-dot";
import { type SelfStatus, usePresence } from "@/stores/presence";

const OPTIONS: { value: SelfStatus; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do not disturb" },
];

export function StatusPicker() {
  const self = usePresence((state) => state.self);
  const setSelf = usePresence((state) => state.setSelf);

  return (
    <div
      aria-label="Your status"
      className="flex items-center gap-1"
      role="group"
    >
      {OPTIONS.map((option) => (
        <Button
          aria-pressed={self === option.value}
          key={option.value}
          onClick={() => {
            setSelf(option.value);
          }}
          size="xs"
          variant={self === option.value ? "secondary" : "ghost"}
        >
          <PresenceDot status={option.value} />
          {option.label}
        </Button>
      ))}
    </div>
  );
}
