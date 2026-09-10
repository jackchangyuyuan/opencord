import { zodResolver } from "@hookform/resolvers/zod";
import {
  CUSTOM_STATUS_EMOJI_MAX_LENGTH,
  CUSTOM_STATUS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "@opencord/shared/constants";
import {
  customStatusEmojiSchema,
  customStatusSchema,
  descriptionSchema,
  type UpdateProfileInput,
} from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, LogOut, Smile, UserRoundCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSession, useSignOut } from "@/features/auth/hooks/use-session";
import { isMemberList } from "@/features/members/api/queries";
import { EmojiPicker } from "@/features/messages/components/emoji-picker";
import { StatusPicker } from "@/features/realtime/components/status-picker";
import {
  type CurrentUser,
  currentUserQuery,
  userQueryKey,
} from "@/features/users/api/queries";
import { AvatarPicker } from "@/features/users/components/avatar-picker";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useUi } from "@/stores/ui";

const profileFormSchema = z.object({
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  description: descriptionSchema,
  customStatus: customStatusSchema,
  customStatusEmoji: z
    .string()
    .trim()
    .max(CUSTOM_STATUS_EMOJI_MAX_LENGTH)
    .refine(
      (value) =>
        value === "" || customStatusEmojiSchema.safeParse(value).success,
      "Use a single emoji",
    ),
});

type ProfileForm = z.infer<typeof profileFormSchema>;

const EMPTY: ProfileForm = {
  name: "",
  description: "",
  customStatus: "",
  customStatusEmoji: "",
};

function clearable(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function patchFrom(values: ProfileForm): UpdateProfileInput {
  return {
    name: values.name,
    description: clearable(values.description),
    customStatus: clearable(values.customStatus),
    customStatusEmoji: clearable(values.customStatusEmoji),
  };
}

const TEXTAREA = cn(
  "min-h-20 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
);

export function ProfileDialog() {
  const queryClient = useQueryClient();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const { data: me } = useQuery(currentUserQuery);
  const { user } = useSession();
  const openModal = useUi((state) => state.openModal);
  const closeModal = useUi((state) => state.closeModal);
  const open = useUi((state) => state.activeModal) === "profile";
  const signOut = useSignOut();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    values:
      me === undefined
        ? EMPTY
        : {
            name: me.name,
            description: me.description ?? "",
            customStatus: me.customStatus ?? "",
            customStatusEmoji: me.customStatusEmoji ?? "",
          },
  });

  const save = useMutation({
    meta: { inline: true },
    mutationFn: (input: UpdateProfileInput) =>
      api<CurrentUser>("/users/@me", { method: "PATCH", body: input }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(currentUserQuery.queryKey, updated);
      queryClient.setQueryData(userQueryKey(updated.id), updated);

      await queryClient.invalidateQueries({
        predicate: (query) => isMemberList(query.queryKey),
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(patchFrom(values));
  });

  const description = form.watch("description");
  const status = form.watch("customStatus");
  const emoji = form.watch("customStatusEmoji");
  const announcing = status.trim() !== "" || emoji.trim() !== "";

  useEffect(() => {
    if (!open) {
      return;
    }

    const bar = document.querySelector('[data-slot="user-bar"]');
    const pencil = bar?.querySelector<HTMLElement>(
      'button[aria-label="Edit profile"]',
    );

    returnFocusRef.current =
      pencil !== null &&
      pencil !== undefined &&
      document.activeElement === pencil
        ? pencil
        : (bar?.querySelector<HTMLElement>(
            'button[aria-label="Your profile"]',
          ) ?? null);
  }, [open]);

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.error === null
        ? null
        : "Could not save your profile";

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) {
          openModal("profile");
        } else {
          closeModal();
        }
      }}
      open={open}
    >
      <DialogContent finalFocus={returnFocusRef}>
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Your name, picture, status and about text, as everybody else sees
            them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {user?.isAnonymous === true ? (
            <Button
              onClick={() => {
                openModal("claim-account");
              }}
              size="sm"
              variant="outline"
            >
              <UserRoundCheck />
              Save my account
            </Button>
          ) : null}

          <Button
            disabled={signOut.isPending}
            onClick={() => {
              closeModal();
              signOut.mutate();
            }}
            size="sm"
            variant="outline"
          >
            <LogOut />
            Sign out
          </Button>
        </div>

        <AvatarPicker
          currentUrl={me?.avatarUrl ?? null}
          fallback={(me?.name ?? "?").slice(0, 2).toUpperCase()}
          kind="avatar"
          label="Choose a picture"
          onPicked={(avatarObjectKey) => {
            save.mutate({ avatarObjectKey });
          }}
        />

        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="profile-name"
                {...form.register("name")}
              />
              <FieldDescription>
                Shown everywhere, and free to repeat somebody else&rsquo;s.
              </FieldDescription>
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-username">Username</FieldLabel>
              <div className="flex h-9 w-full items-center gap-0.5 rounded-lg border border-dashed border-input bg-muted/40 px-3 text-body text-muted-foreground">
                <span aria-hidden>@</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none"
                  id="profile-username"
                  readOnly
                  tabIndex={0}
                  value={me?.username ?? ""}
                />
              </div>
              <FieldDescription>
                How people @mention you. It cannot be changed here.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Status</FieldLabel>
              <StatusPicker appearance="field" />
              <FieldDescription>
                What everybody else sees beside your name. It applies straight
                away and lasts as long as this session.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-status">Custom status</FieldLabel>
              <div className="flex items-center gap-2">
                <EmojiPicker
                  itemLabel={(value) => `Use ${value} as your status emoji`}
                  onClear={() => {
                    form.setValue("customStatusEmoji", "", {
                      shouldDirty: true,
                    });
                  }}
                  onPick={(value) => {
                    form.setValue("customStatusEmoji", value, {
                      shouldDirty: true,
                    });
                  }}
                  tabbable
                  trigger={
                    emoji === "" ? <Smile /> : <span aria-hidden>{emoji}</span>
                  }
                  triggerLabel={
                    emoji === ""
                      ? "Pick a status emoji"
                      : `Status emoji: ${emoji}. Pick another`
                  }
                />
                <Input
                  aria-invalid={
                    form.formState.errors.customStatus !== undefined
                  }
                  autoComplete="off"
                  id="profile-status"
                  maxLength={CUSTOM_STATUS_MAX_LENGTH}
                  placeholder="working on auth"
                  {...form.register("customStatus")}
                />
                <Button
                  aria-label="Clear custom status"
                  disabled={!announcing}
                  onClick={() => {
                    form.setValue("customStatus", "", { shouldDirty: true });
                    form.setValue("customStatusEmoji", "", {
                      shouldDirty: true,
                    });
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Eraser />
                </Button>
              </div>
              <FieldDescription>
                Sits beside your name. Separate from online, idle and do not
                disturb.
              </FieldDescription>
              <FieldError
                errors={[
                  form.formState.errors.customStatusEmoji,
                  form.formState.errors.customStatus,
                ]}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-description">About</FieldLabel>
              <textarea
                aria-invalid={form.formState.errors.description !== undefined}
                className={TEXTAREA}
                id="profile-description"
                maxLength={DESCRIPTION_MAX_LENGTH}
                placeholder="Computer Science @ UWaterloo"
                rows={3}
                {...form.register("description")}
              />
              <FieldDescription>
                {description.length} of {DESCRIPTION_MAX_LENGTH} characters.
                Line breaks are kept; empty clears it.
              </FieldDescription>
              <FieldError errors={[form.formState.errors.description]} />
            </Field>

            {failure === null ? null : (
              <p className="text-sm text-destructive" role="alert">
                {failure}
              </p>
            )}

            <DialogFooter>
              <Button disabled={save.isPending} size="sm" type="submit">
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
