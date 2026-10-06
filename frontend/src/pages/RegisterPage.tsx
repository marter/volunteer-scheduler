import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/client";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOrgNameChange(value: string) {
    setOrganizationName(value);
    if (!slugTouched) setOrganizationSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        email,
        password,
        full_name: fullName,
        organization_name: organizationName,
        organization_slug: organizationSlug,
      });
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not register."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Register your organization</h1>
      <p className="hint">This creates a new organization and makes you its admin.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Organization name
          <input
            value={organizationName}
            onChange={(e) => handleOrgNameChange(e.target.value)}
            placeholder="Community Food Bank"
            required
          />
        </label>
        <label>
          Organization slug
          <input
            value={organizationSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setOrganizationSlug(e.target.value);
            }}
            placeholder="community-food-bank"
            required
          />
        </label>
        <label>
          Your name
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
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create organization"}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
