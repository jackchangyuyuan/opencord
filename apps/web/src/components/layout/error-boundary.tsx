import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/toast";

interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface BoundaryState {
  error: unknown;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  private readonly retry = (): void => {
    this.props.onReset();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <div
        className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
        role="alert"
      >
        <h1 className="text-lg font-semibold">That did not load</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {describeError(this.state.error)}
        </p>
        <Button onClick={this.retry} variant="outline">
          Try again
        </Button>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <Boundary onReset={reset}>{children}</Boundary>}
    </QueryErrorResetBoundary>
  );
}
