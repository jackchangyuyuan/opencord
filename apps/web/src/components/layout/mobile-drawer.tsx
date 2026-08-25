import { Menu } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUi } from "@/stores/ui";

export function MobileDrawer({ children }: { children: ReactNode }) {
  const open = useUi((state) => state.mobileDrawerOpen);
  const setOpen = useUi((state) => state.setMobileDrawerOpen);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={<Button size="icon-sm" variant="ghost" />}
        aria-label="Open navigation"
      >
        <Menu />
      </SheetTrigger>
      <SheetContent className="flex flex-row gap-0 p-0" side="left">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
