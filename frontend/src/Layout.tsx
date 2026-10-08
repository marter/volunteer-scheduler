import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { VerifyBanner } from "./VerifyBanner";

export function Layout() {
  const { me, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/dashboard" className="brand">
            Volunteer Scheduler
          </Link>
          {me && (
            <nav className="topbar-nav">
              <NavLink to="/dashboard" end>
                Events
              </NavLink>
              <NavLink to="/calendar">Calendar</NavLink>
              <NavLink to="/members">Members</NavLink>
            </nav>
          )}
        </div>
        {me && (
          <div className="topbar-user">
            <span className="org-name">{me.organization.name}</span>
            <span className="user-name">
              {me.user.full_name} · {me.role.replace("_", " ")}
            </span>
            <button type="button" className="btn-secondary" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <VerifyBanner />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
