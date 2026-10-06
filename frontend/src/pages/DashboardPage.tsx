import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEvent, listEvents } from "../api/events";
import { extractErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { todayLocalDate } from "../dateUtils";

export function DashboardPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const canManage = me?.role === "org_admin" || me?.role === "coordinator";

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayLocalDate());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createEvent({ name, start_date: startDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setName("");
      setStartDate(todayLocalDate());
      setShowForm(false);
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err, "Could not create event.")),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Events</h1>
        {canManage && (
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New event"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {eventsQuery.isLoading && <p>Loading events…</p>}
      {eventsQuery.isError && <p className="form-error">Could not load events.</p>}

      {eventsQuery.data && eventsQuery.data.length === 0 && (
        <p className="hint">No events yet.</p>
      )}

      <ul className="event-list">
        {eventsQuery.data?.map((event) => (
          <li key={event.id}>
            <Link to={`/events/${event.id}`}>{event.name}</Link>
            <span className="event-date">{event.start_date}</span>
            {event.location && <span className="event-location">{event.location}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
