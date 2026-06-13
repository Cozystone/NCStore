import { getEnv } from "@/lib/env";
import { hashPin } from "@/lib/security";
import type { Member, Product } from "@/lib/types";

const phoneNumbers: Record<string, string> = {
  임채율: "010-2491-3945",
  김안석: "010-5014-1937",
  김성겸: "010-3045-2009",
  신태균: "010-3287-0021",
  정문교: "010-8688-5983",
  김나윤: "010-9246-9626",
  김소율: "010-2021-1251",
  박은우: "010-3355-4385",
  배건홍: "010-6893-4112",
  안가범: "010-7658-5576",
  정준수: "010-9099-7168",
  황승현: "010-9986-2767",
  황준민: "010-7653-0158",
  김영록: "010-5564-2220",
  임소연: "010-9508-1379",
};

const studentRows: Array<[string, string, string, string?, string?]> = [
  ["1기", "고2/고1", "황서영", "여", "active"],
  ["1기", "고2/고1", "신주원", "여", "active"],
  ["1기", "고2/고1", "이승준", undefined, "active"],
  ["1기", "중3/고3/20살", "황승현", undefined, "active"],
  ["2기", "고2", "강지호", undefined, "active"],
  ["2기", "고2", "김성겸", undefined, "active"],
  ["2기", "고2", "김재성", undefined, "active"],
  ["2기", "고2", "안가범", undefined, "active"],
  ["2기", "고1", "김루아", undefined, "active"],
  ["2기", "고1", "김준우", undefined, "active"],
  ["2기", "고1", "이지훈", undefined, "active"],
  ["2기", "고1", "김나윤", "여", "active"],
  ["2기", "중3", "김찬우", undefined, "active"],
  ["2기", "중3", "이솔", undefined, "active"],
  ["2기", "중3", "조아윤", "여", "inactive"],
  ["2기", "중3", "남예슬", "여", "inactive"],
  ["2기", "중3", "정보영", "여", "active"],
  ["2기", "고3", "정준수", "남", "inactive"],
  ["2기", "20살", "신민준", undefined, "active"],
  ["3기", "고2", "김안석", undefined, "active"],
  ["3기", "고2", "황준민", undefined, "active"],
  ["3기", "고2", "백준서", undefined, "active"],
  ["3기", "고2", "정휘람", undefined, "active"],
  ["3기", "고1", "김민재", undefined, "active"],
  ["3기", "고1", "박대건", undefined, "active"],
  ["3기", "고1", "박은우", "여", "active"],
  ["3기", "고1", "신태균", undefined, "active"],
  ["3기", "중3", "김소율", "여", "active"],
  ["3기", "중3", "정문교", undefined, "active"],
  ["3기", "중3", "임채율", undefined, "active"],
  ["3기", "중2", "배건홍", undefined, "active"],
  ["3기", "중2", "정희재", undefined, "active"],
  ["4기", "고1", "김지오", "여", "active"],
];

const teacherNames = [
  "강린아",
  "김민지",
  "김영록",
  "남지수",
  "문성준",
  "변문주",
  "이성우",
  "임소연",
  "정효진",
  "최정인",
  "최진교",
  "최혜인",
];

export function createSeedMembers(): Member[] {
  const now = new Date().toISOString();
  const defaultPin = getEnv().defaultMemberPin;

  const students = studentRows.map(([cohort, grade, name, gender, status], index) => {
    const { pinHash, pinSalt } = hashPin(defaultPin);
    return {
      memberId: `student-${index + 1}`,
      type: "student" as const,
      cohort: cohort as Member["cohort"],
      grade,
      name,
      gender,
      status: (status ?? "active") as Member["status"],
      isAdmin: name === "백준서",
      phoneNumber: phoneNumbers[name],
      smsOptIn: Boolean(phoneNumbers[name]),
      pinHash,
      pinSalt,
      createdAt: now,
      updatedAt: now,
    };
  });

  const teachers = teacherNames.map((name, index) => {
    const { pinHash, pinSalt } = hashPin(defaultPin);
    return {
      memberId: `teacher-${index + 1}`,
      type: "teacher" as const,
      name,
      status: "active" as const,
      phoneNumber: phoneNumbers[name],
      smsOptIn: Boolean(phoneNumbers[name]),
      pinHash,
      pinSalt,
      createdAt: now,
      updatedAt: now,
    };
  });

  return [...students, ...teachers];
}

export function createSeedProducts(): Product[] {
  const now = new Date().toISOString();
  const products: Array<[string, number, string, number, string[]]> = [
    ["피크닉", 700, "피크닉", 37, []],
    ["슈파샤우어 웜즈 구미", 300, "웜즈 젤리", 53, ["웜즈 젤리", "웜즈 구미"]],
    ["몬스터 에너지드링크 망고", 1800, "몬스터", 13, ["몬스터"]],
    ["맥반석 구운 계란", 700, "맥반석 계란", 20, ["맥반석 계란"]],
    ["허니버터칩", 1500, "허니버터칩", 28, []],
    ["이클립스 쿨링 캔디", 800, "이클립스 쿨링 캔디", 27, ["이클립스"]],
    ["오리온 초코파이", 500, "초코파이", 87, ["초코파이"]],
  ];
  return products.map(([name, price, sheetItemName, stock, aliases], index) => ({
    productId: `product-${index + 1}`,
    name,
    price,
    active: true,
    sortOrder: index + 1,
    stock,
    sheetItemName,
    aliases,
    lowStockThreshold: 5,
    createdAt: now,
    updatedAt: now,
  }));
}
