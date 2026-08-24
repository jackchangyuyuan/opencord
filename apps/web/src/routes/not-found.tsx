import { Link } from "react-router";

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link className="underline underline-offset-4" to="/">
        Back to the landing page
      </Link>
    </main>
  );
}
