import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
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
        render={<Button size="icon" variant="ghost" />}
        aria-label="Open navigation"
      >
        <Menu />
      </SheetTrigger>
      <SheetContent
        className="flex flex-row gap-0 p-0 data-[side=left]:w-[21.5rem]"
        showCloseButton={false}
        side="left"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        {children}
        <SheetClose
          render={
            <Button
              className="absolute top-1/2 right-0 z-10 translate-x-1/2 -translate-y-1/2 rounded-full border-border bg-popover shadow-e2"
              size="icon"
              variant="outline"
            />
          }
        >
          <X />
          <span className="sr-only">Close</span>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
