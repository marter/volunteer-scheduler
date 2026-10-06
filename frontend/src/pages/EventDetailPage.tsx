import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEvent, listEventSignUps } from "../api/events";
import { createShift, listShifts } from "../api/shifts";
import { listMembers } from "../api/members";
import { createPosition, createTeam, listTeams } from "../api/teams";
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
  const teamsQuery = useQuery({
    queryKey: ["teams", eventId],
    queryFn: () => listTeams(eventId!),
    enabled: !!eventId,
  });

  const [showForm, setShowForm] = useState(false);
  const [startsAt, setStartsAt] = useState(() => defaultShiftTimes().startsAt);
  const [endsAt, setEndsAt] = useState(() => defaultShiftTimes().endsAt);
  const [capacity, setCapacity] = useState(1);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [positionId, setPositionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [pickerShiftId, setPickerShiftId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addingPositionTeamId, setAddingPositionTeamId] = useState<string | null>(null);
  const [newPositionName, setNewPositionName] = useState("");
  const [positionError, setPositionError] = useState<string | null>(null);

  const createShiftMutation = useMutation({
    mutationFn: () =>
      createShift({
        event_id: eventId!,
        position_id: positionId || undefined,
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
      setPositionId("");
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

  const createTeamMutation = useMutation({
    mutationFn: () => createTeam(eventId!, newTeamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", eventId] });
      setNewTeamName("");
      setTeamError(null);
    },
    onError: (err) => setTeamError(extractErrorMessage(err, "Could not create team.")),
  });

  const createPositionMutation = useMutation({
    mutationFn: (teamId: string) => createPosition(teamId, newPositionName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", eventId] });
      setAddingPositionTeamId(null);
      setNewPositionName("");
      setPositionError(null);
    },
    onError: (err) => setPositionError(extractErrorMessage(err, "Could not create position.")),
  });

  function handleCreateShift(formEvent: FormEvent) {
    formEvent.preventDefault();
    createShiftMutation.mutate();
  }

  function handleCreateTeam(formEvent: FormEvent) {
    formEvent.preventDefault();
    createTeamMutation.mutate();
  }

  function handleCreatePosition(formEvent: FormEvent, teamId: string) {
    formEvent.preventDefault();
    createPositionMutation.mutate(teamId);
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

  const positionLookup = new Map<string, { teamName: string; positionName: string }>();
  for (const team of teamsQuery.data ?? []) {
    for (const position of team.positions) {
      positionLookup.set(position.id, { teamName: team.name, positionName: position.name });
    }
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

  const showTeamsSection = canManage || (teamsQuery.data && teamsQuery.data.length > 0);

  return (
    <div>
      <h1>{event.name}</h1>
      <p className="hint">
        {event.start_date}
        {event.end_date ? ` – ${event.end_date}` : ""}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {event.description && <p>{event.description}</p>}

      {showTeamsSection && (
        <>
          <div className="page-header">
            <h2>Teams &amp; positions</h2>
          </div>

          {canManage && (
            <form className="inline-form" onSubmit={handleCreateTeam}>
              <label>
                New team
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Choir"
                  required
                />
              </label>
              {teamError && <p className="form-error">{teamError}</p>}
              <button type="submit" disabled={createTeamMutation.isPending}>
                {createTeamMutation.isPending ? "Adding…" : "Add team"}
              </button>
            </form>
          )}

          <ul className="team-list">
            {teamsQuery.data?.length === 0 && <li className="hint">No teams yet.</li>}
            {teamsQuery.data?.map((team) => (
              <li key={team.id} className="team-item">
                <div className="team-header">
                  <strong>{team.name}</strong>
                  {canManage &&
                    (addingPositionTeamId === team.id ? (
                      <form
                        className="position-form"
                        onSubmit={(e) => handleCreatePosition(e, team.id)}
                      >
                        <input
                          autoFocus
                          value={newPositionName}
                          onChange={(e) => setNewPositionName(e.target.value)}
                          placeholder="e.g. Guitar"
                          required
                        />
                        <button type="submit" disabled={createPositionMutation.isPending}>
                          Add
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setAddingPositionTeamId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setAddingPositionTeamId(team.id);
                          setNewPositionName("");
                        }}
                      >
                        + Position
                      </button>
                    ))}
                </div>
                {positionError && addingPositionTeamId === team.id && (
                  <p className="form-error">{positionError}</p>
                )}
                <div className="position-chips">
                  {team.positions.length === 0 && (
                    <span className="hint">No positions yet.</span>
                  )}
                  {team.positions.map((p) => (
                    <span key={p.id} className="position-chip">
                      {p.name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

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
          {teamsQuery.data && teamsQuery.data.length > 0 && (
            <label>
              Position
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">No specific position</option>
                {teamsQuery.data.map((team) => (
                  <optgroup key={team.id} label={team.name}>
                    {team.positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
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
          const position = shift.position_id ? positionLookup.get(shift.position_id) : undefined;

          return (
            <li key={shift.id} className="shift-item">
              <div className="shift-row">
                <div>
                  <strong>
                    {new Date(shift.starts_at).toLocaleString()} –{" "}
                    {new Date(shift.ends_at).toLocaleTimeString()}
                  </strong>
                  {position && (
                    <span className="position-tag">
                      {position.teamName} — {position.positionName}
                    </span>
                  )}
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
