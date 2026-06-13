import { SolapiMessageService } from "solapi";
import { getEnv, hasSolapiConfig } from "@/lib/env";
import { paymentStatusLabel, won } from "@/lib/utils";

type ReminderInput = {
  itemSummary: string;
  memberName: string;
  paymentStatus: string;
  phoneNumber: string;
  totalAmount: number;
};

function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/\D/g, "");
}

export function canSendOverdueMessage() {
  return hasSolapiConfig();
}

export async function sendOverdueMessage(input: ReminderInput) {
  if (!hasSolapiConfig()) {
    throw new Error("SOLAPI 환경변수가 아직 설정되지 않았습니다.");
  }

  const env = getEnv();
  const messageService = new SolapiMessageService(env.solapiApiKey!, env.solapiApiSecret!);
  const to = normalizePhoneNumber(input.phoneNumber);
  const from = normalizePhoneNumber(env.solapiSender!);

  if (!/^01\d{8,9}$/.test(to)) {
    throw new Error("수신번호 형식이 올바르지 않습니다. 01012345678 형식으로 입력해 주세요.");
  }

  const text =
    `[넥스트챌린지스쿨 매점 안내]\n` +
    `${input.memberName}님, 아직 확인이 필요한 매점 기록이 있어요.\n` +
    `품목: ${input.itemSummary}\n` +
    `금액: ${won(input.totalAmount)}원\n` +
    `상태: ${paymentStatusLabel(input.paymentStatus as never)}\n` +
    `가능한 시간에 백준서에게 확인 또는 입금 부탁드립니다.`;

  const result = await messageService.send({
    to,
    from,
    text,
  });

  return {
    provider: "solapi",
    result,
    to,
    from,
  };
}
