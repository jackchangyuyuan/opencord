export const OAUTH_ERROR_PARAM = "error";

const MESSAGES: Record<string, string> = {
  access_denied: "You cancelled that sign-in. Nothing has changed.",
  user_cancelled: "You cancelled that sign-in. Nothing has changed.",
  account_not_linked:
    "An account already uses that email address. Sign in with your password, then connect this provider from your account.",
  account_ownership_conflict:
    "That provider account is already connected to a different OpenCord account.",
  account_provider_conflict:
    "That account is already connected through a different provider.",
  signup_disabled: "This deployment is not accepting new accounts right now.",
  unable_to_create_user: "We could not finish creating your account.",
  unable_to_link_account: "We could not connect that provider account.",
  email_not_found: "That provider did not share an email address.",
  invalid_token: "That sign-in link had expired. Try again.",
  state_mismatch: "That sign-in could not be verified. Try again.",
  please_restart_the_process: "That sign-in timed out. Try again.",
};

const FALLBACK = "That sign-in did not complete. Try again.";

export function oauthErrorMessage(code: string | null): string | null {
  if (code === null || code === "") {
    return null;
  }

  return MESSAGES[code.toLowerCase()] ?? FALLBACK;
}
