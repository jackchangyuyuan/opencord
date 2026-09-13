import { Link } from "react-router";

import { CenteredPanel } from "@/components/layout/centered-panel";
import { buttonVariants } from "@/components/ui/button";

export function NotFound() {
  return (
    <CenteredPanel
      description="The link may be stale, or the channel may have been deleted. Neither is something you did."
      title="Page not found"
    >
      <Link className={buttonVariants({ size: "sm" })} to="/">
        Back to the landing page
      </Link>
    </CenteredPanel>
  );
}
