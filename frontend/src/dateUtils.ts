function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocalDateTime(hour: number, minute = 0): string {
  return `${todayLocalDate()}T${pad(hour)}:${pad(minute)}`;
}
