import { Link } from "react-router";

import { CenteredPanel } from "@/components/layout/centered-panel";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export function SignIn() {
  return (
    <CenteredPanel
      description="Your servers, channels and direct messages are where you left them."
      footer={
        <>
          No account yet?{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            to="/sign-up"
          >
            Create one
          </Link>
        </>
      }
      title="Sign in"
    >
      <SignInForm />
    </CenteredPanel>
  );
}
