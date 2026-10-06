import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEvent, listEventSignUps } from "../api/events";
import { createShift, listShifts } from "../api/shifts";
import { listMembers } from "../api/members";
import { cancelSignUp, createSignUp } from "../api/signups";
import { extractErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { todayLocalDateTime } from "../dateUtils";
import type { SignUpDetail } from "../types";

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
  const signUpsQuery = useQuery({
    queryKey: ["signups", eventId],
    queryFn: () => listEventSignUps(eventId!),
    enabled: !!eventId,
  });
  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: listMembers,
    enabled: canManage,
  });

  const [showForm, setShowForm] = useState(false);
  const [startsAt, setStartsAt] = useState(() => defaultShiftTimes().startsAt);
  const [endsAt, setEndsAt] = useState(() => defaultShiftTimes().endsAt);
  const [capacity, setCapacity] = useState(1);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [selectedMemberByShift, setSelectedMemberByShift] = useState<Record<string, string>>({});

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
    mutationFn: ({ shiftId, userId }: { shiftId: string; userId?: string }) =>
      createSignUp(shiftId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["signups", eventId] });
      setSignUpError(null);
    },
    onError: (err) => setSignUpError(extractErrorMessage(err, "Could not sign up.")),
  });

  const cancelMutation = useMutation({
    mutationFn: (signUp: SignUpDetail) => cancelSignUp(signUp.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["signups", eventId] });
    },
  });

  function handleCreateShift(formEvent: FormEvent) {
    formEvent.preventDefault();
    createShiftMutation.mutate();
  }

  if (eventQuery.isLoading) return <p>Loading…</p>;
  if (eventQuery.isError || !eventQuery.data) return <p className="form-error">Event not found.</p>;

  const event = eventQuery.data;
  const signUpsByShift = new Map<string, SignUpDetail[]>();
  for (const signUp of signUpsQuery.data ?? []) {
    const list = signUpsByShift.get(signUp.shift_id) ?? [];
    list.push(signUp);
    signUpsByShift.set(signUp.shift_id, list);
  }

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
          <button type="button" onClick={() => setShowForm((v) => !v)} className={showForm ? "btn-secondary" : undefined}>
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
          const shiftSignUps = (signUpsByShift.get(shift.id) ?? []).filter(
            (s) => s.status !== "cancelled",
          );
          const selectedUserId = selectedMemberByShift[shift.id] || me!.user.id;
          const targetSignUp = shiftSignUps.find((s) => s.user.id === selectedUserId);
          const isFull = shift.open_slots <= 0;

          return (
            <li key={shift.id} className="shift-item">
              <div className="shift-row">
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

                <div className="shift-actions">
                  {canManage && membersQuery.data && (
                    <select
                      value={selectedMemberByShift[shift.id] ?? ""}
                      onChange={(e) =>
                        setSelectedMemberByShift((prev) => ({
                          ...prev,
                          [shift.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Myself</option>
                      {membersQuery.data
                        .filter((m) => m.user.id !== me!.user.id)
                        .map((m) => (
                          <option key={m.user.id} value={m.user.id}>
                            {m.user.full_name}
                          </option>
                        ))}
                    </select>
                  )}

                  {targetSignUp ? (
                    <span className="signup-status">
                      {targetSignUp.status === "confirmed" ? "Signed up" : "Waitlisted"}
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(targetSignUp)}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        signUpMutation.mutate({
                          shiftId: shift.id,
                          userId: selectedMemberByShift[shift.id] || undefined,
                        })
                      }
                      disabled={signUpMutation.isPending}
                    >
                      {isFull ? "Join waitlist" : "Sign up"}
                    </button>
                  )}
                </div>
              </div>

              <ul className="volunteer-list">
                {shiftSignUps.length === 0 && <li className="hint">No volunteers yet.</li>}
                {shiftSignUps.map((signUp) => {
                  const canRemove = canManage || signUp.user.id === me!.user.id;
                  return (
                    <li key={signUp.id}>
                      <span>
                        {signUp.user.full_name}
                        {signUp.status !== "confirmed" && (
                          <span className="hint"> ({signUp.status})</span>
                        )}
                      </span>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => cancelMutation.mutate(signUp)}
                          disabled={cancelMutation.isPending}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
