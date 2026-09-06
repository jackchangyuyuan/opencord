import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BellDot,
  Columns2,
  ScrollText,
  Search,
  Shield,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/hooks/use-session";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { GuideAction } from "@/features/demo/components/guide-action";
import { serversQuery } from "@/features/servers/api/queries";
import { useUi } from "@/stores/ui";

const SECOND_WINDOW = "width=760,height=900,left=820,top=40";

export function GuidePanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const dismissed = useUi((state) => state.demoPanelDismissed);
  const dismiss = useUi((state) => state.dismissDemoPanel);
  const setRightPanel = useUi((state) => state.setRightPanel);
  const openModal = useUi((state) => state.openModal);

  const { data: servers } = useQuery({
    ...serversQuery,
    enabled: user?.isAnonymous === true,
  });

  const sandbox = servers?.find((server) => server.name === "Your sandbox");

  const { data: sandboxChannels } = useQuery({
    ...serverChannelsQuery(sandbox?.id ?? ""),
    enabled: sandbox !== undefined,
  });

  if (user?.isAnonymous !== true || dismissed) {
    return null;
  }

  const openSandbox = () => {
    const [first] = sandboxChannels ?? [];

    void navigate(first === undefined ? "/app" : `/app/channels/${first.id}`);
  };

  return (
    <aside
      aria-labelledby="demo-guide-heading"
      className="fixed right-4 bottom-4 z-40 hidden w-72 flex-col rounded-xl border bg-popover p-3 shadow-lg lg:flex"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-semibold" id="demo-guide-heading">
            Try these
          </h2>
          <p className="text-xs text-muted-foreground">
            Seven things worth thirty seconds.
          </p>
        </div>
        <Button
          aria-label="Dismiss the demo guide"
          onClick={dismiss}
          size="icon-xs"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <ul className="mt-2 flex flex-col">
        <GuideAction
          icon={<Columns2 aria-hidden className="size-4" />}
          label="Open a second window"
          onSelect={() => {
            window.open(
              `${location.pathname}${location.search}`,
              "opencord-second-window",
              SECOND_WINDOW,
            );
          }}
          proves="Real-time delivery, side by side"
        />
        <GuideAction
          icon={<Search aria-hidden className="size-4" />}
          label="Search the archive"
          onSelect={() => {
            setRightPanel("search");
          }}
          proves="Full-text search over 200,000 messages"
        />
        <GuideAction
          icon={<BellDot aria-hidden className="size-4" />}
          label="Check the unread badges"
          onSelect={() => {
            setRightPanel("members");
            void navigate("/app");
          }}
          proves="Read-state tracking across channels"
        />
        <GuideAction
          disabled={sandbox === undefined}
          icon={<Shield aria-hidden className="size-4" />}
          label="Open your sandbox server"
          onSelect={openSandbox}
          proves="Roles, overwrites, invites, kick and ban — you own it"
        />
        <GuideAction
          disabled={sandbox === undefined}
          icon={<ScrollText aria-hidden className="size-4" />}
          label="View the audit log"
          onSelect={() => {
            openSandbox();
            openModal("server-settings");
          }}
          proves="Moderation and accountability"
        />
        <GuideAction
          icon={<Activity aria-hidden className="size-4" />}
          label="See the architecture"
          onSelect={() => {
            setRightPanel("members");
            document
              .querySelector<HTMLElement>("[data-testid=socket-status]")
              ?.scrollIntoView({ block: "center" });
          }}
          proves="Serving instance, socket state, online count"
        />
        <GuideAction
          icon={<UserRoundCheck aria-hidden className="size-4" />}
          label="Save my account"
          onSelect={() => {
            openModal("claim-account");
          }}
          proves="Keep every server, message and DM you have made"
        />
      </ul>
    </aside>
  );
}
