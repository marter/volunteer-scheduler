import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMember, listMembers, markMemberVerified, removeUnverifiedMember } from "../api/members";
import { extractErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { OrgRole } from "../types";

export function MembersPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const isOrgAdmin = me?.role === "org_admin";

  const membersQuery = useQuery({ queryKey: ["members"], queryFn: listMembers });

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<OrgRole>("volunteer");
  const [error, setError] = useState<string | null>(null);

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addMember({
        full_name: fullName,
        email,
        phone: phone || undefined,
        password: password || undefined,
        role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRole("volunteer");
      setShowForm(false);
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err, "Could not add member.")),
  });

  const verifyMutation = useMutation({
    mutationFn: (userId: string) => markMemberVerified(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeUnverifiedMember(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    addMemberMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Members</h1>
        {isOrgAdmin && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? "btn-secondary" : undefined}
          >
            {showForm ? "Cancel" : "Add member"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="only if new"
              minLength={8}
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              <option value="volunteer">Volunteer</option>
              <option value="coordinator">Coordinator</option>
              <option value="org_admin">Org admin</option>
            </select>
          </label>
          <p className="hint" style={{ margin: 0, flex: "1 1 100%" }}>
            Password is only required for someone who doesn't already have an account. If this
            email already exists, they'll just be added to this organization.
          </p>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={addMemberMutation.isPending}>
            {addMemberMutation.isPending ? "Adding…" : "Add member"}
          </button>
        </form>
      )}

      {membersQuery.isLoading && <p>Loading members…</p>}

      <ul className="member-list">
        {membersQuery.data?.map((m) => (
          <li key={m.user.id}>
            <div>
              <div>{m.user.full_name}</div>
              <div className="member-contact">
                {m.user.email}
                {m.user.phone ? ` · ${m.user.phone}` : ""}
              </div>
            </div>
            <div className="member-actions">
              {!m.user.email_verified && (
                <span className="member-role-badge member-role-badge--pending">
                  pending verification
                </span>
              )}
              <span className="member-role-badge">{m.role.replace("_", " ")}</span>
              {isOrgAdmin && !m.user.email_verified && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => verifyMutation.mutate(m.user.id)}
                    disabled={verifyMutation.isPending}
                  >
                    Mark verified
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => removeMutation.mutate(m.user.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
