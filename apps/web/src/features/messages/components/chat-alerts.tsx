import { OctagonX } from "lucide-react";

import {
  Toast,
  ToastClose,
  ToastContent,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from "@/components/ui/toast";
import { chatAlerts } from "@/lib/toast";

const ALERT_TIMEOUT_MS = 5000;

const ALERT_LIMIT = 3;

function AlertList() {
  const { toasts } = useToastManager();

  return toasts.map((alert) => (
    <Toast key={alert.id} toast={alert}>
      <ToastContent className="gap-2.5 p-3">
        <OctagonX aria-hidden className="size-4 shrink-0 text-destructive" />
        <ToastTitle className="min-w-0 flex-1 text-meta font-normal" />
        <ToastClose className="-my-1" />
      </ToastContent>
    </Toast>
  ));
}

export function ChatAlerts() {
  return (
    <ToastProvider
      limit={ALERT_LIMIT}
      timeout={ALERT_TIMEOUT_MS}
      toastManager={chatAlerts}
    >
      <ToastViewport className="absolute inset-x-5 top-4 z-20 h-20 sm:right-5 sm:left-auto sm:w-full">
        <AlertList />
      </ToastViewport>
    </ToastProvider>
  );
}
