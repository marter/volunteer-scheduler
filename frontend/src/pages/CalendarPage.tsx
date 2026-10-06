import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listEvents } from "../api/events";
import type { Event } from "../types";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MAX_VISIBLE = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function CalendarPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const event of eventsQuery.data ?? []) {
      const list = map.get(event.start_date) ?? [];
      list.push(event);
      map.set(event.start_date, list);
    }
    return map;
  }, [eventsQuery.data]);

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

      {eventsQuery.isLoading && <p>Loading…</p>}

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} className="calendar-cell calendar-cell--empty" />;
          const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={cell.dateKey}
              className={`calendar-cell${cell.dateKey === todayKey ? " calendar-cell--today" : ""}`}
            >
              <span className="calendar-day-number">{cell.day}</span>
              <div className="calendar-events">
                {visible.map((event) => (
                  <Link key={event.id} to={`/events/${event.id}`} className="calendar-event">
                    {event.name}
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
