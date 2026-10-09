export type OrgRole = "org_admin" | "coordinator" | "volunteer";

export type SignUpStatus = "pending" | "accepted" | "declined" | "cancelled" | "no_show";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface Me {
  user: User;
  organization: Organization;
  role: OrgRole;
  verification_required: boolean;
}

export interface Event {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  recurrence_rule: string | null;
}

export interface EventCreateInput {
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date?: string;
  recurrence_rule?: string;
}

export interface Shift {
  id: string;
  event_id: string;
  position_id: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  open_slots: number;
}

export interface ShiftCreateInput {
  event_id: string;
  position_id?: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  repeat_weeks: number;
}

export interface Position {
  id: string;
  team_id: string;
  name: string;
}

export interface Team {
  id: string;
  event_id: string;
  name: string;
  positions: Position[];
}

export interface SignUp {
  id: string;
  shift_id: string;
  user_id: string;
  status: SignUpStatus;
}

export interface SignUpDetail {
  id: string;
  shift_id: string;
  status: SignUpStatus;
  user: User;
  starts_at: string;
  ends_at: string;
}

export interface SignUpInvite {
  status: SignUpStatus;
  organization_name: string;
  event_name: string;
  event_location: string | null;
  event_date: string;
  starts_at: string;
  ends_at: string;
  position_label: string | null;
}

export interface Membership {
  user: User;
  role: OrgRole;
}

export interface MemberCreateInput {
  email: string;
  full_name: string;
  phone?: string;
  password?: string;
  role: OrgRole;
}
