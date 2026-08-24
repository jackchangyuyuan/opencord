import { useParams } from "react-router";

export function Invite() {
  const { code } = useParams();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Invite</h1>
      <p className="text-muted-foreground">{code}</p>
    </main>
  );
}
