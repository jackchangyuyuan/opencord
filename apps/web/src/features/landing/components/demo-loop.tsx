import { SendHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const FRAMES = [
  {
    side: "left",
    author: "ada",
    hue: 274,
    line: "the deploy is green",
    delay: 0,
  },
  {
    side: "right",
    author: "ada",
    hue: 274,
    line: "the deploy is green",
    delay: 0.35,
  },
  { side: "right", author: "grace", hue: 162, line: "shipping it", delay: 2 },
  { side: "left", author: "grace", hue: 162, line: "shipping it", delay: 2.35 },
] as const;

const SETTLED = {
  author: "linus",
  hue: 18,
  line: "migration lands at 14:00",
} as const;

const WINDOWS = [
  { side: "left", label: "Window A", instance: "api-1" },
  { side: "right", label: "Window B", instance: "api-2" },
] as const;

function Line({
  author,
  delay,
  hue,
  line,
  still,
}: {
  author: string;
  delay: number;
  hue: number;
  line: string;
  still: boolean;
}) {
  return (
    <div
      className="flex items-start gap-2"
      style={
        still
          ? undefined
          : { animation: `demo-loop-fade 6s ${String(delay)}s infinite` }
      }
    >
      <span
        aria-hidden
        className="tint-swatch mt-0.5 size-4 shrink-0 rounded-full"
        style={{ "--tint-hue": hue } as React.CSSProperties}
      />
      <p className="min-w-0 leading-5">
        <span className="mr-1.5 font-semibold">{author}</span>
        <span className="text-muted-foreground">{line}</span>
      </p>
    </div>
  );
}

export function DemoLoop() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  return (
    <div
      aria-label="Two windows staying in sync as a message is sent"
      className="grid w-full max-w-4xl gap-3 rounded-2xl border bg-card p-3 shadow-e2 sm:grid-cols-2"
      role="img"
    >
      {WINDOWS.map((window) => (
        <div
          className="overflow-hidden rounded-xl border bg-background"
          key={window.side}
        >
          <div className="flex items-center gap-2 border-b bg-sidebar px-2.5 py-1.5">
            <span aria-hidden className="flex gap-1">
              {["a", "b", "c"].map((dot) => (
                <span
                  className="size-1.5 rounded-full bg-muted-foreground/40"
                  key={dot}
                />
              ))}
            </span>
            <span className="text-micro font-medium">{window.label}</span>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[0.5625rem] text-muted-foreground">
              <span className="size-1 rounded-full bg-presence-online" />
              <span className="font-mono">{window.instance}</span>
            </span>
          </div>

          <div className="flex text-left text-meta">
            <div
              aria-hidden
              className="flex w-7 shrink-0 flex-col items-center gap-1.5 border-r bg-rail py-2"
            >
              {[274, 162, 340].map((hue, index) => (
                <span
                  className={cn(
                    "tint-swatch size-4 rounded-[0.3rem]",
                    index > 0 && "opacity-40",
                  )}
                  key={hue}
                  style={{ "--tint-hue": hue } as React.CSSProperties}
                />
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 border-b px-2.5 py-1.5 text-micro font-medium">
                <span aria-hidden className="text-muted-foreground">
                  #
                </span>
                general
              </p>

              <div className="flex min-h-[4.75rem] flex-col justify-end gap-1.5 px-2.5 py-2">
                <Line
                  author={SETTLED.author}
                  delay={0}
                  hue={SETTLED.hue}
                  line={SETTLED.line}
                  still
                />
                {FRAMES.filter((frame) => frame.side === window.side).map(
                  (frame) => (
                    <Line
                      author={frame.author}
                      delay={frame.delay}
                      hue={frame.hue}
                      key={`${frame.author}-${frame.line}`}
                      line={frame.line}
                      still={reducedMotion}
                    />
                  ),
                )}
              </div>

              <div className="mx-2.5 mb-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-micro text-muted-foreground">
                <span className="flex-1">Message #general</span>
                <SendHorizontal aria-hidden className="size-2.5" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
