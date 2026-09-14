import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BellDot,
  Columns2,
  Compass,
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
  const flashArchitecture = useUi((state) => state.flashArchitecture);
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
      className="fixed right-2 bottom-10 z-40 hidden w-[15.5rem] flex-col overflow-hidden rounded-xl border bg-popover shadow-e3 lg:flex xl:w-[17rem]"
    >
      <div className="flex items-start gap-2 border-b bg-brand-subtle/60 px-3 py-2.5">
        <span
          aria-hidden
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground"
        >
          <Compass className="size-3.5" />
        </span>
        <div className="flex-1">
          <h2 className="text-body font-semibold" id="demo-guide-heading">
            Try these
          </h2>
          <p className="text-meta text-muted-foreground">
            Seven things worth thirty seconds.
          </p>
        </div>
        <Button
          aria-label="Dismiss the demo guide"
          className="-mt-0.5 -mr-1"
          onClick={dismiss}
          size="icon-xs"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <ul className="flex flex-col p-1.5">
        <GuideAction
          icon={<Columns2 aria-hidden className="size-3.5" />}
          index={1}
          label="Open a second window"
          onSelect={() => {
            window.open(
              `${location.pathname}${location.search}`,
              "opencord-second-window",
              SECOND_WINDOW,
            );
          }}
          proves="Live delivery, side by side"
        />
        <GuideAction
          icon={<Search aria-hidden className="size-3.5" />}
          index={2}
          label="Search the archive"
          onSelect={() => {
            setRightPanel("search");
          }}
          proves="Full-text search, 200k rows"
        />
        <GuideAction
          icon={<BellDot aria-hidden className="size-3.5" />}
          index={3}
          label="Check the unread badges"
          onSelect={() => {
            setRightPanel("members");
            void navigate("/app");
          }}
          proves="Read state across channels"
        />
        <GuideAction
          disabled={sandbox === undefined}
          icon={<Shield aria-hidden className="size-3.5" />}
          index={4}
          label="Open your sandbox server"
          onSelect={openSandbox}
          proves="Roles, invites, kick and ban"
        />
        <GuideAction
          disabled={sandbox === undefined}
          icon={<ScrollText aria-hidden className="size-3.5" />}
          index={5}
          label="View the audit log"
          onSelect={() => {
            openSandbox();
            openModal("server-settings");
          }}
          proves="Moderation and accountability"
        />
        <GuideAction
          icon={<Activity aria-hidden className="size-3.5" />}
          index={6}
          label="See the architecture"
          onSelect={flashArchitecture}
          proves="Instance, sockets, online count"
        />
        <GuideAction
          icon={<UserRoundCheck aria-hidden className="size-3.5" />}
          index={7}
          label="Save my account"
          onSelect={() => {
            openModal("claim-account");
          }}
          proves="Keep everything you have made"
        />
      </ul>
    </aside>
  );
}
