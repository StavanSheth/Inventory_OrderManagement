export function toUtcIsoString(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseUtcIsoString(isoString: string): Date {
  return new Date(isoString);
}
