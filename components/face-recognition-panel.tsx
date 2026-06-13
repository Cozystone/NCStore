"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, PrimaryButton, SecondaryButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PublicMember } from "@/lib/types";

type FaceMode = "recognize" | "enrollScan" | "enrollName" | "enrollDone";
type FaceBox = [number, number, number, number];
type EnrollmentPose = "front" | "left" | "right" | "up";

type FaceResult = {
  embedding?: number[] | Float32Array;
  score?: number;
  boxScore?: number;
  faceScore?: number;
  boxRaw?: FaceBox;
  size?: [number, number];
  rotation?: {
    angle?: {
      roll?: number;
      yaw?: number;
      pitch?: number;
    };
  } | null;
};

type FaceDetectionResult = {
  face: FaceResult[];
};

type HumanInstance = {
  load(): Promise<void>;
  warmup(): Promise<void>;
  detect(input: HTMLVideoElement): Promise<FaceDetectionResult>;
};

type Props = {
  members: PublicMember[];
  onSelect(member: PublicMember): void;
  onClose(): void;
  fullScreen?: boolean;
  initialMode?: "recognize" | "enrollScan";
  onModeChange?(mode: FaceMode): void;
  onEnrollComplete?(member: PublicMember): void;
};

const ENROLL_SAMPLES_PER_POSE = 3;
const RECOGNITION_SAMPLE_TARGET = 3;
const MATCH_DISTANCE_THRESHOLD = 0.6;
const MATCH_DISTANCE_MARGIN = 0.025;

const ENROLLMENT_POSES: Array<{
  key: EnrollmentPose;
  title: string;
  instruction: string;
  hint: string;
}> = [
  {
    key: "front",
    title: "1. 정면",
    instruction: "정면을 보고 잠깐 멈춰 주세요",
    hint: "눈과 코가 프레임 중앙에 오게 맞춰요.",
  },
  {
    key: "left",
    title: "2. 왼쪽",
    instruction: "고개를 천천히 왼쪽으로 돌려 주세요",
    hint: "너무 많이 돌리지 말고 반쯤만 돌려요.",
  },
  {
    key: "right",
    title: "3. 오른쪽",
    instruction: "고개를 천천히 오른쪽으로 돌려 주세요",
    hint: "눈은 화면을 보지 않아도 괜찮아요.",
  },
  {
    key: "up",
    title: "4. 위쪽",
    instruction: "고개를 살짝 위로 들어 주세요",
    hint: "턱을 조금 올리고 1초만 멈춰요.",
  },
];

const ENROLL_SAMPLE_TARGET = ENROLLMENT_POSES.length * ENROLL_SAMPLES_PER_POSE;

let humanPromise: Promise<HumanInstance> | null = null;

function emptyEnrollmentSamples(): Record<EnrollmentPose, number[][]> {
  return {
    front: [],
    left: [],
    right: [],
    up: [],
  };
}

function distance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - (b[index] ?? 0)) ** 2, 0));
}

function averageDescriptors(samples: number[][]) {
  if (!samples.length) return [];
  const size = samples[0]?.length ?? 0;
  const average = Array.from({ length: size }, (_, index) =>
    samples.reduce((sum, sample) => sum + (sample[index] ?? 0), 0) / samples.length,
  );
  const norm = Math.sqrt(average.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? average.map((value) => value / norm) : average;
}

function getFaceArea(face: FaceResult) {
  const box = face.boxRaw;
  if (box) return Math.max(0, box[2]) * Math.max(0, box[3]);
  const size = face.size;
  return size ? size[0] * size[1] : 0;
}

function getBestFace(faces: FaceResult[]) {
  return faces
    .filter((face) => face.embedding?.length)
    .sort((a, b) => {
      const qualityA = (a.score ?? 0) + (a.boxScore ?? 0) + (a.faceScore ?? 0) + getFaceArea(a);
      const qualityB = (b.score ?? 0) + (b.boxScore ?? 0) + (b.faceScore ?? 0) + getFaceArea(b);
      return qualityB - qualityA;
    })[0];
}

function evaluateFaceQuality(face: FaceResult | undefined) {
  if (!face?.embedding?.length) return { ok: false, message: "얼굴을 프레임 안에 맞춰 주세요." };

  const score = face.score ?? 1;
  const boxScore = face.boxScore ?? 1;
  const faceScore = face.faceScore ?? 1;
  if (score < 0.72 || boxScore < 0.68 || faceScore < 0.55) {
    return { ok: false, message: "얼굴이 흐리거나 조명이 약합니다. 정면에서 다시 맞춰 주세요." };
  }

  const [x, y, width, height] = face.boxRaw ?? [0.25, 0.2, 0.5, 0.6];
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  if (width < 0.16 || height < 0.2) {
    return { ok: false, message: "얼굴이 너무 작습니다. 패드에 조금 더 가까이 와 주세요." };
  }
  if (width > 0.78 || height > 0.88) {
    return { ok: false, message: "얼굴이 너무 가깝습니다. 패드에서 조금 떨어져 주세요." };
  }
  if (Math.abs(centerX - 0.5) > 0.22 || Math.abs(centerY - 0.5) > 0.24) {
    return { ok: false, message: "얼굴을 프레임 중앙에 맞춰 주세요." };
  }

  return { ok: true, message: "좋은 얼굴 프레임입니다." };
}

function getPoseStatus(face: FaceResult | undefined, pose: EnrollmentPose) {
  const angle = face?.rotation?.angle;
  if (!angle) return { ok: pose === "front", message: "얼굴 각도를 읽는 중입니다. 천천히 움직여 주세요." };

  const yaw = angle.yaw ?? 0;
  const pitch = angle.pitch ?? 0;
  const roll = Math.abs(angle.roll ?? 0);
  if (roll > 0.45) return { ok: false, message: "머리가 기울었습니다. 얼굴을 수평으로 맞춰 주세요." };

  if (pose === "front") {
    return Math.abs(yaw) < 0.22 && Math.abs(pitch) < 0.25
      ? { ok: true, message: "정면 좋아요. 잠깐 유지해 주세요." }
      : { ok: false, message: "먼저 정면을 보고 잠깐 멈춰 주세요." };
  }
  if (pose === "left") {
    return yaw < -0.18 && yaw > -0.68
      ? { ok: true, message: "왼쪽 각도 좋아요. 그대로 유지해 주세요." }
      : { ok: false, message: "고개를 왼쪽으로 천천히 돌려 주세요." };
  }
  if (pose === "right") {
    return yaw > 0.18 && yaw < 0.68
      ? { ok: true, message: "오른쪽 각도 좋아요. 그대로 유지해 주세요." }
      : { ok: false, message: "고개를 오른쪽으로 천천히 돌려 주세요." };
  }
  return pitch < -0.12
    ? { ok: true, message: "위쪽 각도 좋아요. 잠깐 유지해 주세요." }
    : { ok: false, message: "고개를 살짝 위로 들어 주세요." };
}

async function loadHuman() {
  if (!humanPromise) {
    humanPromise = (async () => {
      const moduleUrl = `${window.location.origin}/vendor/human.esm.js`;
      const { Human } = (await import(/* webpackIgnore: true */ moduleUrl)) as {
        Human: new (config: Record<string, unknown>) => HumanInstance;
      };
      const human = new Human({
        cacheSensitivity: 0,
        modelBasePath: "https://vladmandic.github.io/human/models",
        filter: {
          enabled: true,
          equalization: true,
          autoBrightness: true,
          contrast: 0.12,
          sharpness: 0.18,
        },
        face: {
          enabled: true,
          detector: {
            rotation: true,
            return: true,
            mask: false,
            maxDetected: 3,
            minConfidence: 0.55,
            minSize: 80,
            scale: 1.5,
          },
          description: { enabled: true, minConfidence: 0.55 },
          emotion: { enabled: false },
          iris: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });
      await human.load();
      await human.warmup();
      return human;
    })();
  }
  return humanPromise;
}

export function FaceRecognitionPanel({
  members,
  onSelect,
  onClose,
  fullScreen = false,
  initialMode = "recognize",
  onModeChange,
  onEnrollComplete,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onSelectRef = useRef(onSelect);
  const matcherPoolRef = useRef<PublicMember[]>([]);
  const modeRef = useRef<FaceMode>(initialMode);
  const activePoseIndexRef = useRef(0);
  const enrollSamplesRef = useRef<Record<EnrollmentPose, number[][]>>(emptyEnrollmentSamples());
  const recognitionSamplesRef = useRef<number[][]>([]);
  const [mode, setMode] = useState<FaceMode>(initialMode);
  const [activePoseIndex, setActivePoseIndex] = useState(0);
  const [status, setStatus] = useState("카메라 준비 중");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDescriptor, setPendingDescriptor] = useState<number[] | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [nameInput, setNameInput] = useState("");
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const [mirrorCorrected, setMirrorCorrected] = useState(true);

  const matcherPool = useMemo(
    () => members.filter((member) => member.faceDescriptor?.length),
    [members],
  );

  const exactNameMember = useMemo(() => {
    const normalized = nameInput.trim();
    if (!normalized) return null;
    return members.find((member) => member.status === "active" && member.name === normalized) ?? null;
  }, [members, nameInput]);

  const nameSuggestions = useMemo(() => {
    const normalized = nameInput.trim();
    if (!normalized) return [];
    return members
      .filter((member) => member.status === "active" && member.name.includes(normalized))
      .slice(0, 4);
  }, [members, nameInput]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    matcherPoolRef.current = matcherPool;
  }, [matcherPool]);

  useEffect(() => {
    modeRef.current = mode;
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let interval: number | null = null;
    let detecting = false;
    let matched = false;
    let stableCandidate: { memberId: string; count: number } | null = null;

    async function boot() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        }

        setStatus("카메라 권한을 확인하는 중입니다.");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 1.333 },
          },
        });

        if (!videoRef.current || !active) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus("얼굴 AI 모델을 불러오는 중입니다.");
        const human = await loadHuman();

        if (!active) return;
        setReady(true);
        setStatus(
          modeRef.current === "enrollScan"
            ? ENROLLMENT_POSES[0].instruction
            : "얼굴을 프레임 중앙에 맞춰 주세요.",
        );

        interval = window.setInterval(async () => {
          if (!videoRef.current || detecting || matched || modeRef.current === "enrollName" || modeRef.current === "enrollDone") {
            return;
          }

          detecting = true;
          try {
            const result = await human.detect(videoRef.current);
            if (!active) return;

            const face = getBestFace(result.face);
            const quality = evaluateFaceQuality(face);
            if (!quality.ok) {
              stableCandidate = null;
              recognitionSamplesRef.current = [];
              setSampleCount(
                ENROLLMENT_POSES.reduce((sum, pose) => sum + enrollSamplesRef.current[pose.key].length, 0),
              );
              setStatus(quality.message);
              return;
            }

            const descriptor = Array.from(face?.embedding ?? []);
            if (modeRef.current === "enrollScan") {
              const activePose = ENROLLMENT_POSES[activePoseIndexRef.current] ?? ENROLLMENT_POSES[0];
              const poseStatus = getPoseStatus(face, activePose.key);
              if (!poseStatus.ok) {
                setStatus(poseStatus.message);
                return;
              }

              const poseSamples = [...enrollSamplesRef.current[activePose.key], descriptor].slice(-ENROLL_SAMPLES_PER_POSE);
              enrollSamplesRef.current = {
                ...enrollSamplesRef.current,
                [activePose.key]: poseSamples,
              };
              const totalCount = ENROLLMENT_POSES.reduce(
                (sum, pose) => sum + enrollSamplesRef.current[pose.key].length,
                0,
              );
              setSampleCount(totalCount);

              if (poseSamples.length < ENROLL_SAMPLES_PER_POSE) {
                setStatus(`${activePose.title} ${poseSamples.length}/${ENROLL_SAMPLES_PER_POSE}장 저장 중...`);
                return;
              }

              const nextPoseIndex = activePoseIndexRef.current + 1;
              if (nextPoseIndex < ENROLLMENT_POSES.length) {
                activePoseIndexRef.current = nextPoseIndex;
                setActivePoseIndex(nextPoseIndex);
                setStatus(ENROLLMENT_POSES[nextPoseIndex].instruction);
                return;
              }

              modeRef.current = "enrollName";
              setPendingDescriptor(
                averageDescriptors(ENROLLMENT_POSES.flatMap((pose) => enrollSamplesRef.current[pose.key])),
              );
              setMode("enrollName");
              setStatus("얼굴 스캔 완료. 이제 이름을 입력해 주세요.");
              return;
            }

            const pool = matcherPoolRef.current;
            if (!pool.length) {
              setStatus("등록된 얼굴이 없습니다. 먼저 얼굴 등록을 눌러 주세요.");
              return;
            }

            recognitionSamplesRef.current = [...recognitionSamplesRef.current, descriptor].slice(-RECOGNITION_SAMPLE_TARGET);
            if (recognitionSamplesRef.current.length < RECOGNITION_SAMPLE_TARGET) {
              setStatus(`얼굴 확인 중... ${recognitionSamplesRef.current.length}/${RECOGNITION_SAMPLE_TARGET}`);
              return;
            }

            const averagedDescriptor = averageDescriptors(recognitionSamplesRef.current);
            const scored = pool
              .map((member) => ({
                member,
                score: distance(member.faceDescriptor ?? [], averagedDescriptor),
              }))
              .sort((a, b) => a.score - b.score);

            const best = scored[0];
            const second = scored[1];
            const margin = second ? second.score - best.score : Number.POSITIVE_INFINITY;
            if (!best || best.score >= MATCH_DISTANCE_THRESHOLD) {
              stableCandidate = null;
              setStatus("등록된 얼굴과 아직 일치하지 않습니다. 정면에서 다시 맞춰 주세요.");
              return;
            }
            if (margin < MATCH_DISTANCE_MARGIN) {
              stableCandidate = null;
              setStatus("비슷한 얼굴 후보가 있습니다. 얼굴을 더 크게 중앙에 맞춰 주세요.");
              return;
            }

            if (stableCandidate?.memberId === best.member.memberId) {
              stableCandidate.count += 1;
            } else {
              stableCandidate = { memberId: best.member.memberId, count: 1 };
            }

            if (stableCandidate.count >= 2) {
              matched = true;
              setStatus(`${best.member.name} 인식 완료`);
              onSelectRef.current(best.member);
            } else {
              setStatus(`${best.member.name} 확인 중... 한 번만 더 정면을 유지해 주세요.`);
            }
          } finally {
            detecting = false;
          }
        }, 700);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "카메라를 사용할 수 없습니다.");
      }
    }

    void boot();

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function startEnrollment() {
    setError(null);
    setEnrollMessage(null);
    setPendingDescriptor(null);
    setNameInput("");
    enrollSamplesRef.current = emptyEnrollmentSamples();
    recognitionSamplesRef.current = [];
    activePoseIndexRef.current = 0;
    setActivePoseIndex(0);
    setSampleCount(0);
    modeRef.current = "enrollScan";
    setMode("enrollScan");
    setStatus(
      ready
        ? ENROLLMENT_POSES[0].instruction
        : "카메라 준비가 끝나면 자동 스캔합니다.",
    );
  }

  function backToRecognition() {
    setEnrollMessage(null);
    setPendingDescriptor(null);
    setNameInput("");
    enrollSamplesRef.current = emptyEnrollmentSamples();
    recognitionSamplesRef.current = [];
    activePoseIndexRef.current = 0;
    setActivePoseIndex(0);
    setSampleCount(0);
    modeRef.current = "recognize";
    setMode("recognize");
    setStatus(matcherPool.length ? "얼굴을 프레임 중앙에 맞춰 주세요." : "등록된 얼굴이 없습니다. 먼저 얼굴 등록을 눌러 주세요.");
  }

  async function submitEnrollment() {
    const member = exactNameMember;
    if (!pendingDescriptor) {
      setEnrollMessage("얼굴 스캔이 아직 완료되지 않았습니다.");
      return;
    }
    if (!member) {
      setEnrollMessage("명단에 있는 이름과 정확히 일치해야 등록할 수 있습니다.");
      return;
    }

    setEnrollMessage("명단 확인 완료. 평균 얼굴 데이터를 저장하는 중입니다.");
    const response = await fetch("/api/face/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: member.memberId,
        name: member.name,
        faceDescriptor: pendingDescriptor,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setEnrollMessage(payload.error ?? "얼굴 등록에 실패했습니다.");
      return;
    }

    const updatedMember = payload.member as PublicMember;
    onEnrollComplete?.(updatedMember);
    modeRef.current = "enrollDone";
    setMode("enrollDone");
    setEnrollMessage(`${updatedMember.name} 얼굴 등록 완료. 이제 얼굴 인식으로 바로 선택할 수 있습니다.`);
    setStatus("얼굴 등록 완료");
  }

  return (
    <Card className={cn("p-5 text-center", fullScreen ? "face-fullscreen-card flex h-full min-h-0 flex-col p-4 sm:p-5" : "")}>
      <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Camera AI</p>
          <h3 className={fullScreen ? "mt-1 text-3xl font-black text-zinc-950" : "mt-2 text-xl font-black text-zinc-950"}>
            {mode === "recognize" ? "얼굴 인식" : "얼굴 등록"}
          </h3>
          {fullScreen ? (
            <p className="mx-auto mt-1 max-w-xl text-sm font-semibold leading-6 text-zinc-500">
              정면, 왼쪽, 오른쪽, 위쪽 얼굴을 차례로 스캔해서 조명과 각도 오차를 줄입니다.
            </p>
          ) : null}
        </div>
        <button className="text-sm font-bold text-zinc-500 hover:text-zinc-950" onClick={onClose} type="button">
          닫기
        </button>
      </div>

      {!error ? (
        <div className="mx-auto mt-3 grid w-full max-w-xl shrink-0 gap-2 sm:grid-cols-3">
          <SecondaryButton className="h-11" onClick={onClose}>
            이름으로 선택
          </SecondaryButton>
          <PrimaryButton className="h-11 bg-cyan-600 hover:bg-cyan-700" onClick={startEnrollment}>
            처음이면 얼굴 등록
          </PrimaryButton>
          <SecondaryButton className="h-11" onClick={backToRecognition}>
            얼굴 인식 시작
          </SecondaryButton>
        </div>
      ) : null}

      {mode === "enrollScan" ? (
        <div className="mx-auto mt-3 w-full max-w-xl shrink-0 border border-cyan-200 bg-cyan-50 p-3">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
            {ENROLLMENT_POSES[activePoseIndex]?.title}
          </div>
          <div className="mt-1 text-base font-black text-zinc-950">
            {ENROLLMENT_POSES[activePoseIndex]?.instruction}
          </div>
          <div className="mt-1 text-xs font-semibold text-zinc-500">
            {ENROLLMENT_POSES[activePoseIndex]?.hint}
          </div>
          <div className="mt-3 h-2 overflow-hidden bg-white">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${Math.min(100, (sampleCount / ENROLL_SAMPLE_TARGET) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs font-black text-cyan-800">
            전체 {sampleCount}/{ENROLL_SAMPLE_TARGET}장
          </div>
        </div>
      ) : null}

      {matcherPool.length === 0 && mode === "recognize" ? (
        <div className="mt-3 shrink-0 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          등록된 얼굴 데이터가 없습니다. 얼굴 등록부터 시작할 수 있습니다.
        </div>
      ) : null}

      <div
        className={cn(
          "relative mx-auto mt-3 min-h-0 overflow-hidden border border-zinc-200 bg-zinc-950",
          fullScreen ? "face-camera-stage w-full max-w-[900px] flex-1" : "w-full max-w-sm",
          ready ? "ring-2 ring-cyan-200" : "",
        )}
      >
        <video
          autoPlay
          className={cn(fullScreen ? "face-video h-full min-h-[300px] w-full object-contain" : "aspect-[4/3] w-full object-contain")}
          muted
          playsInline
          ref={videoRef}
          style={{ transform: mirrorCorrected ? "scaleX(-1)" : undefined }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="face-frame relative h-[68%] w-[54%] max-w-[360px] rounded-[46%] border-4 border-cyan-200/90 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-100/40" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-100/40" />
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-zinc-950/80 px-3 py-1 text-xs font-black text-white">
              정면, 밝게, 중앙에
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 shrink-0">
        <p className="text-sm font-semibold leading-6 text-zinc-500">{error ?? status}</p>
        <button
          className="mt-1 text-xs font-black text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950"
          onClick={() => setMirrorCorrected((current) => !current)}
          type="button"
        >
          좌우반전 보정 {mirrorCorrected ? "켜짐" : "꺼짐"}
        </button>
      </div>

      {mode === "enrollName" || mode === "enrollDone" ? (
        <div className="mx-auto mt-3 w-full max-w-xl shrink-0 border border-zinc-200 bg-white p-3">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Name Check</div>
          <input
            className="mt-2 h-11 w-full border border-zinc-300 px-4 text-center text-base font-black text-zinc-950 outline-none focus:border-zinc-950"
            disabled={mode === "enrollDone"}
            onChange={(event) => {
              setNameInput(event.target.value);
              setEnrollMessage(null);
            }}
            placeholder="명단에 있는 이름을 정확히 입력"
            value={nameInput}
          />
          {exactNameMember ? (
            <div className="mt-2 text-sm font-black text-cyan-700">
              명단 확인: {exactNameMember.name} {exactNameMember.cohort ?? ""} {exactNameMember.grade ?? ""}
            </div>
          ) : nameSuggestions.length ? (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {nameSuggestions.map((member) => (
                <button
                  className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-black text-zinc-700"
                  key={member.memberId}
                  onClick={() => setNameInput(member.name)}
                  type="button"
                >
                  {member.name}
                </button>
              ))}
            </div>
          ) : null}
          {enrollMessage ? <div className="mt-2 text-sm font-semibold text-zinc-600">{enrollMessage}</div> : null}
          {mode === "enrollName" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SecondaryButton className="h-11" onClick={startEnrollment}>
                다시 스캔
              </SecondaryButton>
              <PrimaryButton className="h-11" disabled={!exactNameMember} onClick={() => void submitEnrollment()}>
                명단 대조 후 등록
              </PrimaryButton>
            </div>
          ) : null}
          {mode === "enrollDone" && exactNameMember ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SecondaryButton className="h-11" onClick={backToRecognition}>
                얼굴 인식으로
              </SecondaryButton>
              <PrimaryButton className="h-11" onClick={() => onSelectRef.current(exactNameMember)}>
                이 이름으로 계속 구매
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto mt-3 grid w-full max-w-xl shrink-0 gap-2 sm:grid-cols-3">
        {error ? (
          <PrimaryButton className="sm:col-span-3" onClick={onClose}>
            돌아가기
          </PrimaryButton>
        ) : (
          <>
            <SecondaryButton className="h-11" onClick={onClose}>
              이름 직접 선택
            </SecondaryButton>
            <SecondaryButton className="h-11" onClick={startEnrollment}>
              얼굴 등록
            </SecondaryButton>
            <PrimaryButton className="h-11" onClick={backToRecognition}>
              인식 모드
            </PrimaryButton>
          </>
        )}
      </div>
    </Card>
  );
}
