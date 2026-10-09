import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getInviteByToken, respondToInvite } from "../api/signups";
import { extractErrorMessage } from "../api/client";
import type { SignUpInvite } from "../types";

function formatWhen(invite: SignUpInvite): string {
  const starts = new Date(invite.starts_at);
  const ends = new Date(invite.ends_at);
  const day = starts.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = starts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = ends.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${startTime} – ${endTime}`;
}

/** Opened from an emailed invite link. Never logged in -- the token itself is the proof. */
export function RespondToInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const suggestedAction = params.get("action") === "decline" ? "decline" : "accept";
  const [error, setError] = useState<string | null>(null);

  const inviteQuery = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInviteByToken(token),
    enabled: !!token,
    retry: false,
  });

  const respondMutation = useMutation({
    mutationFn: (action: "accept" | "decline") => respondToInvite(token, action),
    onSuccess: () => setError(null),
    onError: (err) => setError(extractErrorMessage(err, "Couldn't record your response.")),
  });

  // Keep showing the freshest status after responding, without a second round-trip.
  const invite = respondMutation.data ?? inviteQuery.data;

  if (!token) {
    return (
      <div className="auth-card">
        <h1>Link problem</h1>
        <p className="hint">This link is missing its code.</p>
      </div>
    );
  }

  if (inviteQuery.isLoading) {
    return (
      <div className="auth-card">
        <p className="page-loading">Loading…</p>
      </div>
    );
  }

  if (inviteQuery.isError || !invite) {
    return (
      <div className="auth-card">
        <h1>Link problem</h1>
        <p className="hint">{extractErrorMessage(inviteQuery.error, "That link isn't valid.")}</p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>{invite.organization_name}</h1>
      <p className="hint">You're invited to volunteer</p>

      <div className="invite-summary">
        <strong>{invite.event_name}</strong>
        {invite.position_label && <span className="position-tag">{invite.position_label}</span>}
        <p>{formatWhen(invite)}</p>
        {invite.event_location && <p className="hint">{invite.event_location}</p>}
      </div>

      {invite.status === "pending" && (
        <>
          <div className="invite-actions">
            <button
              type="button"
              className={suggestedAction === "decline" ? "btn-secondary" : undefined}
              onClick={() => respondMutation.mutate("accept")}
              disabled={respondMutation.isPending}
            >
              Accept
            </button>
            <button
              type="button"
              className={suggestedAction === "accept" ? "btn-secondary" : undefined}
              onClick={() => respondMutation.mutate("decline")}
              disabled={respondMutation.isPending}
            >
              Decline
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </>
      )}

      {invite.status === "accepted" && (
        <p className="hint">You've accepted this shift. See you there!</p>
      )}
      {invite.status === "declined" && (
        <p className="hint">You've declined this shift.</p>
      )}

      <p>
        <Link to="/login">Log in</Link> to see your full schedule.
      </p>
    </div>
  );
}
