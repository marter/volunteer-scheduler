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
import { Modal } from "../Modal";
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
  const [pickerShiftId, setPickerShiftId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

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

  function openPicker(shiftId: string) {
    setPickerShiftId(shiftId);
    setMemberSearch("");
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

  const pickerShift = shiftsQuery.data?.find((s) => s.id === pickerShiftId) ?? null;
  const pickerSignUps = pickerShift
    ? (signUpsByShift.get(pickerShift.id) ?? []).filter((s) => s.status !== "cancelled")
    : [];
  const pickerCandidates = (membersQuery.data ?? [])
    .filter((m) => m.user.id !== me!.user.id)
    .filter((m) => !pickerSignUps.some((s) => s.user.id === m.user.id))
    .filter((m) => {
      const q = memberSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        m.user.full_name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)
      );
    });

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
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? "btn-secondary" : undefined}
          >
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
          const mySignUp = shiftSignUps.find((s) => s.user.id === me!.user.id);
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
                  {canManage && (
                    <button type="button" className="btn-secondary" onClick={() => openPicker(shift.id)}>
                      Sign up someone…
                    </button>
                  )}

                  {mySignUp ? (
                    <span className="signup-status">
                      {mySignUp.status === "confirmed" ? "You're signed up" : "Waitlisted"}
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
                      onClick={() => signUpMutation.mutate({ shiftId: shift.id })}
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

      {pickerShift && (
        <Modal title="Sign up someone" onClose={() => setPickerShiftId(null)}>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            autoFocus
            className="member-search"
          />
          <ul className="member-picker-list">
            {pickerCandidates.length === 0 && (
              <li className="hint">
                {membersQuery.isLoading ? "Loading members…" : "No matching members."}
              </li>
            )}
            {pickerCandidates.map((m) => (
              <li key={m.user.id}>
                <div>
                  <div>{m.user.full_name}</div>
                  <div className="hint">{m.user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => signUpMutation.mutate({ shiftId: pickerShift.id, userId: m.user.id })}
                  disabled={signUpMutation.isPending}
                >
                  {pickerShift.open_slots <= 0 ? "Join waitlist" : "Sign up"}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
