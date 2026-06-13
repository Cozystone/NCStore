"use client";

import { useMemo, useState } from "react";
import { AppShell, Card, Header, PrimaryButton } from "@/components/ui";
import { compareKoreanNames } from "@/lib/utils";
import type { PublicMember } from "@/lib/types";

type Props = {
  members: PublicMember[];
};

export function SuggestionsClient({ members }: Props) {
  const [memberId, setMemberId] = useState("");
  const [productName, setProductName] = useState("");
  const [expectedPrice, setExpectedPrice] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);

  const activeMembers = useMemo(
    () =>
      members
        .filter((member) => member.status === "active")
        .sort((a, b) => compareKoreanNames(a.name, b.name)),
    [members],
  );

  async function submit() {
    const selected = members.find((member) => member.memberId === memberId);
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: selected?.memberId,
        memberName: selected?.name,
        productName,
        expectedPrice: expectedPrice ? Number(expectedPrice) : undefined,
        reason,
      }),
    });
    if (response.ok) {
      setDone(true);
      setProductName("");
      setExpectedPrice("");
      setReason("");
    }
  }

  return (
    <AppShell>
      <Header
        eyebrow="Suggestions"
        title="간식 제안"
        description="먹고 싶은 간식을 남겨주세요. 운영팀이 관리자 화면과 시트에서 검토합니다."
      />

      <Card className="mx-auto w-full max-w-3xl p-5 text-center sm:p-6">
        <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
        <h2 className="text-2xl font-black text-slate-950">무엇을 들여오면 좋을까요?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
          이름은 선택 사항입니다. 가격을 모르겠으면 비워두고 간식 이름만 보내도 됩니다.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-left text-sm font-black text-slate-700">
            이름
            <select
              className="mt-2 h-12 w-full border border-slate-200 bg-white px-4 text-center font-semibold text-slate-950 outline-none focus:border-slate-950"
              onChange={(event) => setMemberId(event.target.value)}
              value={memberId}
            >
              <option value="">이름 선택 안 함</option>
              {activeMembers.map((member) => (
                <option key={member.memberId} value={member.memberId}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-left text-sm font-black text-slate-700">
            예상 가격
            <input
              className="mt-2 h-12 w-full border border-slate-200 bg-white px-4 text-center font-semibold text-slate-950 outline-none focus:border-slate-950"
              inputMode="numeric"
              onChange={(event) => setExpectedPrice(event.target.value.replace(/\D/g, ""))}
              placeholder="선택"
              value={expectedPrice}
            />
          </label>
        </div>

        <label className="mt-4 block text-left text-sm font-black text-slate-700">
          간식 이름
          <input
            className="mt-2 h-14 w-full border border-slate-200 bg-white px-4 text-center text-lg font-black text-slate-950 outline-none focus:border-slate-950"
            onChange={(event) => setProductName(event.target.value)}
            placeholder="예: 포카칩, 초코우유"
            value={productName}
          />
        </label>

        <label className="mt-4 block text-left text-sm font-black text-slate-700">
          이유
          <textarea
            className="mt-2 min-h-28 w-full resize-none border border-slate-200 bg-white px-4 py-3 text-center font-semibold text-slate-950 outline-none focus:border-slate-950"
            onChange={(event) => setReason(event.target.value)}
            placeholder="왜 팔면 좋을까요? 선택 사항"
            value={reason}
          />
        </label>

        <div className="mx-auto mt-5 max-w-sm">
          <PrimaryButton disabled={!productName.trim()} onClick={() => void submit()}>
            제안 보내기
          </PrimaryButton>
        </div>
        {done ? (
          <p className="mt-4 text-sm font-semibold text-emerald-700">
            제안이 등록되었습니다. 운영팀이 검토 후 실제 판매 목록에 반영할 수 있습니다.
          </p>
        ) : null}
      </Card>
    </AppShell>
  );
}
