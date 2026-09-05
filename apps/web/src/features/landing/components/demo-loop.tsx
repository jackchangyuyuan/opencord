import { useMediaQuery } from "@/lib/use-media-query";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const FRAMES = [
  { window: "Window A", line: "ada: the deploy is green", side: "left" },
  { window: "Window B", line: "ada: the deploy is green", side: "right" },
  { window: "Window B", line: "grace: shipping it", side: "right" },
  { window: "Window A", line: "grace: shipping it", side: "left" },
] as const;

export function DemoLoop() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  return (
    <div
      aria-label="Two windows staying in sync as a message is sent"
      className="grid w-full max-w-2xl grid-cols-2 gap-3 rounded-xl border bg-card p-3 text-left"
      role="img"
    >
      {(["left", "right"] as const).map((side) => (
        <div className="flex flex-col gap-2" key={side}>
          <p className="text-[0.625rem] tracking-wide text-muted-foreground uppercase">
            {side === "left" ? "Window A" : "Window B"}
          </p>
          {FRAMES.filter((frame) => frame.side === side).map((frame, index) => (
            <p
              className="rounded-lg bg-muted px-2 py-1 text-xs"
              key={frame.line}
              style={
                reducedMotion
                  ? undefined
                  : {
                      animation: `demo-loop-fade 6s ${String(index * 1.2)}s infinite`,
                    }
              }
            >
              {frame.line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
