import {
  Accessibility,
  Cloud,
  Database,
  MessagesSquare,
  Network,
} from "lucide-react";
import type { ReactNode } from "react";

const CARDS: {
  title: string;
  body: string;
  chips?: string[];
  icon: ReactNode;
  span: string;
}[] = [
  {
    title: "Distributed realtime",
    body: "Several Node and Express instances run at once, Socket.IO fans out between them through Redis, and PostgreSQL stays the durable record. Nothing in the design assumes a single process.",
    icon: <Network aria-hidden className="size-4" />,
    span: "lg:col-span-2",
  },
  {
    title: "AWS S3 media storage",
    body: "Images, file uploads and avatars are posted straight at AWS S3 on a presigned POST, so no API instance keeps a file on its own disk and no media reaches the database. The same AWS SDK client points at an S3-compatible service in development.",
    icon: <Cloud aria-hidden className="size-4" />,
    span: "lg:col-span-2",
  },
  {
    title: "Polished and accessible",
    body: "A responsive React and TypeScript interface built with Tailwind CSS, shadcn/ui and Base UI, scanned by Axe against WCAG 2.2 AA rules in both themes on every end-to-end run.",
    icon: <Accessibility aria-hidden className="size-4" />,
    span: "lg:col-span-2",
  },
  {
    title: "200,000 seeded messages",
    body: "The demo opens on a corpus rather than an empty room, so the things that only get hard at volume are there to be tried from the first click.",
    chips: [
      "Keyset pagination",
      "Infinite history",
      "Full-text search",
      "Jump to a result",
    ],
    icon: <Database aria-hidden className="size-4" />,
    span: "lg:col-span-3",
  },
  {
    title: "Built like a real product",
    body: "Servers and channels, direct messages, roles and permissions, invites, moderation and an audit log: the surface area of a client people would actually use.",
    chips: [
      "Replies",
      "Reactions",
      "Editing",
      "Mentions",
      "Presence",
      "Typing",
      "Unread",
      "Search",
      "Pins",
      "Uploads",
    ],
    icon: <MessagesSquare aria-hidden className="size-4" />,
    span: "sm:col-span-2 lg:col-span-3",
  },
];

export function FeatureCards() {
  return (
    <section aria-labelledby="feature-cards-heading" className="w-full">
      <h2
        className="text-sm font-semibold tracking-[0.08em] text-muted-foreground uppercase"
        id="feature-cards-heading"
      >
        What is inside
      </h2>
      <ul className="mt-5 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-6">
        {CARDS.map((card) => (
          <li
            className={`group flex flex-col rounded-xl border bg-card p-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-e2 ${card.span}`}
            key={card.title}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
              {card.icon}
            </span>
            <h3 className="mt-3 text-body font-semibold">{card.title}</h3>
            <p className="mt-1 text-body leading-relaxed text-muted-foreground">
              {card.body}
            </p>
            {card.chips === undefined ? null : (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {card.chips.map((chip) => (
                  <span
                    className="rounded-full border bg-muted/60 px-2 py-0.5 text-meta text-muted-foreground"
                    key={chip}
                  >
                    {chip}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
