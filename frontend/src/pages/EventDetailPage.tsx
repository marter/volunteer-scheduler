import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEvent } from "../api/events";
import { createShift, listShifts } from "../api/shifts";
import { cancelSignUp, createSignUp } from "../api/signups";
import { extractErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { todayLocalDateTime } from "../dateUtils";
import type { SignUp } from "../types";

function defaultShiftTimes(): { startsAt: string; endsAt: string } {
  return { startsAt: todayLocalDateTime(9), endsAt: todayLocalDateTime(12) };
}

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const canManage = me?.role === "org_admin" || me?.role === "coordinator";

  const eventQuery = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });
  const shiftsQuery = useQuery({
    queryKey: ["shifts", eventId],
    queryFn: () => listShifts(eventId!),
    enabled: !!eventId,
  });

  // The API doesn't yet expose "my signups", so we track sign-ups made this
  // session locally. A page reload will lose the cancel option until that
  // endpoint exists.
  const [mySignUps, setMySignUps] = useState<Record<string, SignUp>>({});

  const [showForm, setShowForm] = useState(false);
  const [startsAt, setStartsAt] = useState(() => defaultShiftTimes().startsAt);
  const [endsAt, setEndsAt] = useState(() => defaultShiftTimes().endsAt);
  const [capacity, setCapacity] = useState(1);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<string | null>(null);

  const createShiftMutation = useMutation({
    mutationFn: () =>
      createShift({
        event_id: eventId!,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity,
        repeat_weeks: repeatWeeks,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", eventId] });
      const defaults = defaultShiftTimes();
      setStartsAt(defaults.startsAt);
      setEndsAt(defaults.endsAt);
      setCapacity(1);
      setRepeatWeeks(1);
      setShowForm(false);
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err, "Could not create shift.")),
  });

  const signUpMutation = useMutation({
    mutationFn: (shiftId: string) => createSignUp(shiftId),
    onSuccess: (signUp) => {
      setMySignUps((prev) => ({ ...prev, [signUp.shift_id]: signUp }));
      queryClient.invalidateQueries({ queryKey: ["shifts", eventId] });
      setSignUpError(null);
    },
    onError: (err) => setSignUpError(extractErrorMessage(err, "Could not sign up.")),
  });

  const cancelMutation = useMutation({
    mutationFn: (signUp: SignUp) => cancelSignUp(signUp.id),
    onSuccess: (_, signUp) => {
      setMySignUps((prev) => {
        const next = { ...prev };
        delete next[signUp.shift_id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["shifts", eventId] });
    },
  });

  function handleCreateShift(formEvent: FormEvent) {
    formEvent.preventDefault();
    createShiftMutation.mutate();
  }

  if (eventQuery.isLoading) return <p>Loading…</p>;
  if (eventQuery.isError || !eventQuery.data) return <p className="form-error">Event not found.</p>;

  const event = eventQuery.data;

  return (
    <div>
      <h1>{event.name}</h1>
      <p className="hint">
        {event.start_date}
        {event.end_date ? ` – ${event.end_date}` : ""}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {event.description && <p>{event.description}</p>}

      <div className="page-header">
        <h2>Shifts</h2>
        {canManage && (
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New shift"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreateShift}>
          <label>
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>
          <label>
            Ends at
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </label>
          <label>
            Capacity
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Repeat weekly for
            <input
              type="number"
              min={1}
              max={52}
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(Number(e.target.value))}
              required
            />
          </label>
          <p className="hint" style={{ margin: 0, flex: "1 1 100%" }}>
            {repeatWeeks > 1
              ? `Creates ${repeatWeeks} shifts, one each week on the same day and time.`
              : "Leave at 1 for a single shift, or increase to repeat weekly."}
          </p>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={createShiftMutation.isPending}>
            {createShiftMutation.isPending ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {shiftsQuery.isLoading && <p>Loading shifts…</p>}
      {shiftsQuery.data && shiftsQuery.data.length === 0 && (
        <p className="hint">No shifts scheduled yet.</p>
      )}
      {signUpError && <p className="form-error">{signUpError}</p>}

      <ul className="shift-list">
        {shiftsQuery.data?.map((shift) => {
          const mySignUp = mySignUps[shift.id];
          const isFull = shift.open_slots <= 0 && !mySignUp;
          return (
            <li key={shift.id}>
              <div>
                <strong>
                  {new Date(shift.starts_at).toLocaleString()} –{" "}
                  {new Date(shift.ends_at).toLocaleTimeString()}
                </strong>
                <span className="hint">
                  {" "}
                  {shift.open_slots} / {shift.capacity} open
                </span>
              </div>
              {mySignUp ? (
                <span className="signup-status">
                  {mySignUp.status === "confirmed" ? "You're signed up" : "Waitlisted"}{" "}
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate(mySignUp)}
                    disabled={cancelMutation.isPending}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => signUpMutation.mutate(shift.id)}
                  disabled={signUpMutation.isPending}
                >
                  {isFull ? "Join waitlist" : "Sign up"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
