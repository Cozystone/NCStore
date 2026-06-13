import { fail, ok } from "@/lib/api";
import { suggestionSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = suggestionSchema.safeParse(body);
  if (!parsed.success) return fail("제안 입력값이 올바르지 않습니다.");
  const suggestion = await getSource().createSuggestion(parsed.data);
  return ok(suggestion, { status: 201 });
}
