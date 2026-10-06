import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listEvents } from "../api/events";
import { listShifts } from "../api/shifts";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MAX_VISIBLE = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function localDateKeyFromISO(iso: string): string {
  const d = new Date(iso);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

interface DayEntry {
  eventId: string;
  eventName: string;
}

export function CalendarPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const shiftsQuery = useQuery({ queryKey: ["shifts", "all"], queryFn: () => listShifts() });
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // An event appears on its start_date, plus the date of every shift it has
  // (shift recurrence generates one shift per week, each on its own date) —
  // deduped so an event shows at most once per day.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, Map<string, DayEntry>>();
    const addEntry = (dateKey: string, eventId: string, eventName: string) => {
      const dayMap = map.get(dateKey) ?? new Map<string, DayEntry>();
      dayMap.set(eventId, { eventId, eventName });
      map.set(dateKey, dayMap);
    };

    const events = eventsQuery.data ?? [];
    const eventNameById = new Map(events.map((e) => [e.id, e.name]));
    for (const event of events) {
      addEntry(event.start_date, event.id, event.name);
    }
    for (const shift of shiftsQuery.data ?? []) {
      const eventName = eventNameById.get(shift.event_id);
      if (!eventName) continue;
      addEntry(localDateKeyFromISO(shift.starts_at), shift.event_id, eventName);
    }
    return map;
  }, [eventsQuery.data, shiftsQuery.data]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: Array<{ day: number; dateKey: string } | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      dateKey: toDateKey(year, month, i + 1),
    })),
  ];

  return (
    <div>
      <div className="page-header">
        <h1>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h1>
        <div className="calendar-nav">
          <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            ‹
          </button>
          <button type="button" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </button>
          <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            ›
          </button>
        </div>
      </div>

      {(eventsQuery.isLoading || shiftsQuery.isLoading) && <p>Loading…</p>}

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} className="calendar-cell calendar-cell--empty" />;
          const dayEntries = Array.from(entriesByDate.get(cell.dateKey)?.values() ?? []);
          const visible = dayEntries.slice(0, MAX_VISIBLE);
          const overflow = dayEntries.length - visible.length;
          return (
            <div
              key={cell.dateKey}
              className={`calendar-cell${cell.dateKey === todayKey ? " calendar-cell--today" : ""}`}
            >
              <span className="calendar-day-number">{cell.day}</span>
              <div className="calendar-events">
                {visible.map((entry) => (
                  <Link key={entry.eventId} to={`/events/${entry.eventId}`} className="calendar-event">
                    {entry.eventName}
                  </Link>
                ))}
                {overflow > 0 && <span className="calendar-overflow">+{overflow} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
