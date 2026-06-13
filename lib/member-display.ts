import type { PublicMember } from "@/lib/types";

export type MemberDisplayGroup = "student" | "adult" | "teacher";

export function getMemberDisplayGroup(member: Pick<PublicMember, "type" | "grade">): MemberDisplayGroup {
  if (member.type === "teacher") return "teacher";
  const grade = member.grade ?? "";
  if (/20|성인|adult/i.test(grade)) return "adult";
  return "student";
}

export function getMemberDisplayLabel(member: Pick<PublicMember, "type" | "grade">) {
  const group = getMemberDisplayGroup(member);
  if (group === "teacher") return "교사";
  if (group === "adult") return "성인";
  return "학생";
}

export function getMemberAdminSubtitle(
  member: Pick<PublicMember, "type" | "grade" | "cohort">,
) {
  const group = getMemberDisplayGroup(member);
  if (group === "teacher") return "교사";
  if (group === "adult") return "성인";
  return `${member.cohort ?? ""} ${member.grade ?? ""}`.trim() || "학생";
}
