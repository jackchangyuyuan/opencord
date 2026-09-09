import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M18.4 6.6A8 8 0 1 0 20 11.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <circle cx="18.8" cy="5.2" fill="currentColor" r="2.6" />
    </svg>
  );
}
