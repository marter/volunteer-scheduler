import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const FEATURES = [
  {
    image: "/landing/events.jpg",
    title: "Events and shifts",
    body: "Set up events with as many shifts as you need. Volunteers sign up for the ones that fit their schedule.",
  },
  {
    image: "/landing/calendar.jpg",
    title: "A calendar that makes sense",
    body: "See every event and its recurring shifts laid out by date, so nothing gets double-booked or forgotten.",
  },
  {
    image: "/landing/roster.jpg",
    title: "Know who's signed up",
    body: "Every shift shows its volunteers, their status, and lets a coordinator sign up someone else directly.",
  },
  {
    image: "/landing/teams.jpg",
    title: "Teams and positions",
    body: "Group shifts by team and position -- like Choir and Guitar -- so volunteers sign up for the right role.",
  },
];

/** The public front door. Logged-in users skip straight to their dashboard. */
export function LandingPage() {
  const { me, isLoading } = useAuth();

  if (isLoading) return <p className="page-loading">Loading…</p>;
  if (me) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing">
      <header className="landing-hero">
        <img src="/favicon.svg" alt="" width="56" height="56" />
        <h1>Volunteer Scheduler</h1>
        <p className="landing-tagline">
          Organize events, shifts, and the people who show up for them -- without a
          spreadsheet.
        </p>
        <div className="landing-actions">
          <Link to="/login" className="landing-button landing-button--primary">
            Log in
          </Link>
          <Link to="/register" className="landing-button">
            Create account
          </Link>
        </div>
      </header>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <article key={f.title} className="landing-feature">
            <img src={f.image} alt="" loading="lazy" width="600" height="1200" />
            <div>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="landing-footer">
        <Link to="/login" className="landing-button landing-button--primary">
          Log in
        </Link>
        <p className="hint">
          A side project by <a href="https://martinteran.me">Martin Teran</a>.
        </p>
      </footer>
    </div>
  );
}
