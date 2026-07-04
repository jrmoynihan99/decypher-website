import teamJson from "@/data/team.json";

export interface TeamMemberJson {
  name: string;
  tag: string;
  role: string;
  tier: "manager" | "senior" | "staff";
  codename: string | null;
  img: string;
}

export interface TeamMember {
  name: string;
  tag: string;
  role: string;
  fid: string;
  codename: string;
  redacted: string;
  img: string;
}

export interface TeamTier {
  label: string;
  count: string;
  people: TeamMember[];
}

const PENDING_CODENAME = "Awaiting decryption";

/** Redact a codename into block characters, preserving word breaks. */
export function redact(s: string): string {
  return s.replace(/\S/g, "█");
}

const members = teamJson as TeamMemberJson[];

let seq = 0;
function toMember(m: TeamMemberJson): TeamMember {
  const codename = m.codename || PENDING_CODENAME;
  return {
    name: m.name,
    tag: m.tag,
    role: m.role,
    fid: `ID-${String(++seq).padStart(2, "0")}`,
    codename,
    redacted: redact(codename),
    img: `/${m.img}`,
  };
}

const managers = members.filter((m) => m.tier === "manager").map(toMember);
const seniors = members.filter((m) => m.tier === "senior").map(toMember);
const staff = members.filter((m) => m.tier === "staff").map(toMember);

export const teamTiers: TeamTier[] = [
  { label: "Managers", count: String(managers.length).padStart(2, "0"), people: managers },
  { label: "Seniors", count: String(seniors.length).padStart(2, "0"), people: seniors },
  { label: "Staff", count: String(staff.length).padStart(2, "0"), people: staff },
];
