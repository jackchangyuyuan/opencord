import { Button } from "@/components/ui/button";
import { TtlCountdown } from "@/features/demo/components/ttl-countdown";
import { useGuestTtl } from "@/features/demo/hooks/use-guest-ttl";
import { useUi } from "@/stores/ui";

export function ClaimPrompt() {
  const { isGuest, remainingMs, expiring } = useGuestTtl();
  const openModal = useUi((state) => state.openModal);

  if (!isGuest || !expiring) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t bg-card px-4 py-2 text-sm"
      data-testid="claim-prompt"
    >
      <p role="status">
        Your guest session is nearly over — save it and keep every server,
        message and DM you have made.
      </p>
      <p className="text-muted-foreground">
        Ends in <TtlCountdown remainingMs={remainingMs} />
      </p>
      <Button
        onClick={() => {
          openModal("claim-account");
        }}
        size="sm"
      >
        Save my account
      </Button>
    </div>
  );
}
