import { Link } from "react-router";

import { CenteredPanel } from "@/components/layout/centered-panel";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export function SignUp() {
  return (
    <CenteredPanel
      description="A username, an email and a password. Nothing else is asked for."
      footer={
        <>
          Already registered?{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            to="/sign-in"
          >
            Sign in
          </Link>
        </>
      }
      title="Create your account"
    >
      <SignUpForm />
    </CenteredPanel>
  );
}
