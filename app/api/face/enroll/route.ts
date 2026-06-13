import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getSource } from "@/lib/store";

const faceEnrollSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(30),
  faceDescriptor: z.array(z.number()).min(16).max(4096),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = faceEnrollSchema.safeParse(body);
  if (!parsed.success) return fail("얼굴 등록 값이 올바르지 않습니다.");

  const source = getSource();
  const member = await source.getMember(parsed.data.memberId);
  if (!member || member.status !== "active" || member.name !== parsed.data.name.trim()) {
    return fail("명단에 있는 이름과 일치하지 않습니다.", 404);
  }

  const updated = await source.updateMember(member.memberId, {
    faceDescriptor: parsed.data.faceDescriptor,
  });
  if (!updated) return fail("얼굴 데이터를 저장하지 못했습니다.", 500);

  return ok({ member: updated });
}
