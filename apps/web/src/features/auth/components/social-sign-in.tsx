import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  type SocialProvider,
  socialProvidersQuery,
} from "@/features/auth/api/providers";
import {
  GitHubMark,
  GoogleMark,
} from "@/features/auth/components/provider-icons";
import {
  OAUTH_ERROR_PARAM,
  oauthErrorMessage,
} from "@/features/auth/lib/oauth-error";
import { readReturnTo, returnToQuery } from "@/features/auth/lib/return-to";
import { authClient } from "@/lib/auth-client";

const PROVIDERS: Record<
  SocialProvider,
  { label: string; mark: (props: { className?: string }) => React.ReactElement }
> = {
  google: { label: "Continue with Google", mark: GoogleMark },
  github: { label: "Continue with GitHub", mark: GitHubMark },
};

export function SocialSignIn({ page }: { page: "sign-in" | "sign-up" }) {
  const [searchParams] = useSearchParams();
  const { data: providers } = useQuery(socialProvidersQuery);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  const failure = oauthErrorMessage(searchParams.get(OAUTH_ERROR_PARAM));

  if (providers === undefined || providers.length === 0) {
    return failure === null ? null : <Failure>{failure}</Failure>;
  }

  const from = readReturnTo(searchParams);
  const origin = window.location.origin;

  const start = (provider: SocialProvider) => {
    setPending(provider);

    void authClient.signIn.social({
      provider,
      callbackURL: `${origin}${from}`,
      errorCallbackURL: `${origin}/${page}${returnToQuery(from)}`,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {failure === null ? null : <Failure>{failure}</Failure>}

      <div className="flex flex-col gap-2">
        {providers.map((provider) => {
          const { label, mark: Mark } = PROVIDERS[provider];
          const busy = pending === provider;

          return (
            <Button
              disabled={pending !== null}
              key={provider}
              onClick={() => {
                start(provider);
              }}
              size="lg"
              type="button"
              variant="outline"
            >
              {busy ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Mark className="size-[1.125rem]" />
              )}
              {label}
            </Button>
          );
        })}
      </div>

      <p
        aria-hidden
        className="flex items-center gap-3 text-micro tracking-[0.1em] text-muted-foreground uppercase"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </p>
    </div>
  );
}

function Failure({ children }: { children: string }) {
  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {children}
    </p>
  );
}
