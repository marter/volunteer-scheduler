import { Link, Outlet } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";

export function Layout() {
  const { me, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            Volunteer Scheduler
          </Link>
          {me && (
            <nav className="topbar-nav">
              <Link to="/">Events</Link>
              <Link to="/calendar">Calendar</Link>
            </nav>
          )}
        </div>
        {me && (
          <div className="topbar-user">
            <span className="org-name">{me.organization.name}</span>
            <span className="user-name">
              {me.user.full_name} · {me.role.replace("_", " ")}
            </span>
            <button type="button" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
