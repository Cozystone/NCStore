"use client";

import { useMemo, useState } from "react";
import { AppShell, Card, Header, PrimaryButton, SecondaryButton } from "@/components/ui";
import { getMemberDisplayLabel } from "@/lib/member-display";
import { compareKoreanNames, formatDateTime, paymentStatusLabel, won } from "@/lib/utils";
import type { PublicMember, Purchase } from "@/lib/types";

type Props = {
  members: PublicMember[];
};

export function LedgerClient({ members }: Props) {
  const [selectedMember, setSelectedMember] = useState<PublicMember | null>(null);
  const [query, setQuery] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<Purchase[]>([]);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [verified, setVerified] = useState(false);

  const visibleMembers = useMemo(() => {
    const keyword = query.trim();
    return members
      .filter((member) => member.status === "active")
      .filter((member) => (keyword ? member.name.includes(keyword) : true))
      .sort((a, b) => compareKoreanNames(a.name, b.name));
  }, [members, query]);

  async function verify() {
    if (!selectedMember) return;
    setError(null);
    const pinResponse = await fetch("/api/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMember.memberId, pin, purpose: "ledger" }),
    });
    const pinPayload = await pinResponse.json();
    if (!pinResponse.ok || !pinPayload.ok) {
      setError("PIN이 올바르지 않습니다.");
      setPin("");
      return;
    }

    const ledgerResponse = await fetch(`/api/my-ledger?memberId=${selectedMember.memberId}`);
    const ledgerPayload = await ledgerResponse.json();
    if (!ledgerResponse.ok) {
      setError(ledgerPayload.error ?? "장부를 불러오지 못했습니다.");
      return;
    }
    setRecords(ledgerPayload.purchases);
    setPendingAmount(ledgerPayload.pendingAmount);
    setVerified(true);
  }

  function reset() {
    setVerified(false);
    setSelectedMember(null);
    setPin("");
    setRecords([]);
    setPendingAmount(0);
    setError(null);
  }

  if (verified && selectedMember) {
    return (
      <AppShell>
        <Header
          eyebrow="My Ledger"
          title={`${selectedMember.name}님의 최근 기록`}
          description="본인 확인 후 최근 구매 내역과 아직 정산되지 않은 금액만 간단히 볼 수 있습니다."
        />
        <Card className="mx-auto mb-4 w-full max-w-2xl text-center">
          <div className="text-sm font-semibold text-slate-500">대기 금액</div>
          <div className="mt-1 text-4xl font-black text-slate-950">{won(pendingAmount)}</div>
        </Card>
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {records.map((record) => (
            <Card className="space-y-2 text-center" key={record.purchaseId}>
              <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
                <span>{formatDateTime(record.timestamp)}</span>
                <span>{paymentStatusLabel(record.paymentStatus)}</span>
              </div>
              <div className="font-black text-slate-950">{record.itemSummary}</div>
              <div className="text-xl font-black text-slate-950">{won(record.totalAmount)}</div>
            </Card>
          ))}
          {!records.length ? (
            <Card className="text-center text-sm font-semibold text-slate-500">아직 구매 기록이 없습니다.</Card>
          ) : null}
        </div>
        <div className="mx-auto mt-4 w-full max-w-sm">
          <PrimaryButton onClick={reset}>다른 이름으로 확인</PrimaryButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header
        eyebrow="My Ledger"
        title="내 장부 확인"
        description="이름을 먼저 선택한 뒤 PIN 4자리로 본인 확인을 합니다."
      />

      <section className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex max-h-[62dvh] min-h-[420px] flex-col p-4 text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-16" />
          <h2 className="text-xl font-black text-slate-950">사람 선택</h2>
          <input
            className="mx-auto mt-3 h-12 w-full max-w-md border border-slate-200 bg-white px-4 text-center font-semibold outline-none focus:border-slate-950"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름 검색"
            value={query}
          />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border border-slate-200 bg-white">
            {visibleMembers.map((member) => {
              const selected = selectedMember?.memberId === member.memberId;
              return (
                <button
                  className={`flex min-h-14 w-full items-center justify-center border-b border-slate-100 px-4 py-2 text-center transition last:border-b-0 ${
                    selected ? "bg-slate-950 text-white" : "bg-white text-slate-950 hover:bg-slate-50"
                  }`}
                  key={member.memberId}
                  onClick={() => {
                    setSelectedMember(member);
                    setError(null);
                  }}
                  type="button"
                >
                  <span>
                    <span className="block text-lg font-black">{member.name}</span>
                    <span className={selected ? "text-xs font-semibold text-white/60" : "text-xs font-semibold text-slate-400"}>
                      {getMemberDisplayLabel(member)}
                    </span>
                  </span>
                </button>
              );
            })}
            {!visibleMembers.length ? (
              <div className="p-8 text-sm font-semibold text-slate-500">검색 결과가 없습니다.</div>
            ) : null}
          </div>
        </Card>

        <Card className="self-start p-4 text-center">
          <div className="text-sm font-semibold text-slate-500">선택된 사람</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{selectedMember?.name ?? "아직 없음"}</div>
          <input
            className="mt-4 h-14 w-full border border-slate-200 bg-white px-4 text-center text-xl font-black tracking-[0.4em] outline-none focus:border-slate-950"
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            value={pin}
          />
          {error ? <div className="mt-3 text-sm font-semibold text-red-600">{error}</div> : null}
          <div className="mt-4 grid gap-2">
            <PrimaryButton disabled={!selectedMember || pin.length !== 4} onClick={() => void verify()}>
              확인
            </PrimaryButton>
            <SecondaryButton onClick={() => window.history.back()}>돌아가기</SecondaryButton>
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
