const BULLETS = [
  {
    title: "Two API containers behind NGINX",
    body: "Socket.IO fans out through a Redis adapter, so a message sent on one instance arrives on the other.",
  },
  {
    title: "Twelve permission bits, all enforced",
    body: "One resolver composes roles, hierarchy and per-channel overwrites; the API decides and the client only mirrors.",
  },
  {
    title: "Keyset pagination over 200,000 messages",
    body: "No OFFSET anywhere but search, and UUIDv7 ids are the ordering the read state compares against.",
  },
  {
    title: "PostgreSQL full-text search",
    body: "Ranked results constrained to the channels you can actually see, through the same resolver the sockets use.",
  },
  {
    title: "Direct-to-storage uploads",
    body: "A presigned POST policy the storage service enforces on the bytes, and read URLs minted at serialization.",
  },
  {
    title: "Guests are ordinary accounts",
    body: "No capability is withheld from a visitor: the demo exercises the same authorization as a registered session.",
  },
];

export function ArchitectureBullets() {
  return (
    <section
      aria-labelledby="architecture-heading"
      className="w-full max-w-4xl"
    >
      <h2 className="text-lg font-semibold" id="architecture-heading">
        What is underneath
      </h2>
      <ul className="mt-4 grid gap-4 text-left sm:grid-cols-2">
        {BULLETS.map((bullet) => (
          <li className="rounded-xl border p-4" key={bullet.title}>
            <h3 className="text-sm font-medium">{bullet.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{bullet.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
