import { fail, ok } from "@/lib/api";
import { memberFirstUseSetupSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = memberFirstUseSetupSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");

  const source = getSource();
  const member = await source.getMember(parsed.data.memberId);
  if (!member) return fail("멤버를 찾지 못했습니다.", 404);
  if (member.status !== "active") return fail("활성 멤버만 키오스크를 사용할 수 있습니다.", 403);
  if (member.type !== "student") return fail("최초 설정은 학생에게만 필요합니다.", 403);
  if (member.kioskSetupCompletedAt) return fail("이미 최초 설정이 완료된 학생입니다.", 409);

  try {
    const phoneNumber = normalizePhoneNumber(parsed.data.phoneNumber);
    const kioskSetupCompletedAt = new Date().toISOString();
    const updatedMember = await source.updateMember(member.memberId, {
      phoneNumber,
      smsOptIn: true,
      kioskSetupCompletedAt,
    });
    if (!updatedMember) return fail("멤버 정보를 저장하지 못했습니다.", 404);

    const memberWithPin = await source.resetMemberPin(member.memberId, parsed.data.pin);
    if (!memberWithPin) return fail("PIN을 저장하지 못했습니다.", 404);

    return ok({
      member: {
        ...memberWithPin,
        phoneNumber,
        smsOptIn: true,
        kioskSetupCompletedAt,
      },
    });
  } catch (reason) {
    return fail(reason instanceof Error ? reason.message : "최초 설정 저장에 실패했습니다.", 500);
  }
}
