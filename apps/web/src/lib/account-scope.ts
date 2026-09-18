let current = 0;

export function accountScope(): number {
  return current;
}

export function isCurrentScope(scope: number): boolean {
  return scope === current;
}

export function endAccountScope(): void {
  current += 1;
}
