# NCS Snack Kiosk

넥스트챌린지스쿨에서 사용할 매점 운영 웹사이트입니다. Lenovo Tab M9 세로형 키오스크 흐름, 관리자 정산 화면, `내 장부 확인`, `간식 제안`, Google Sheets 연동, 실험용 얼굴 인식 빠른 선택, `SOLAPI` 기반 체납 안내 발신을 포함합니다.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Google Sheets API
- PWA
- Experimental browser-side face recognition with local face descriptors
- SOLAPI overdue reminder sending

## Tablet Targets

주요 키오스크 UI는 세로형 태블릿을 기준으로 검증합니다.

- Lenovo Tab M9 / 현재 패드: `800 x 1280`
- Galaxy Tab A7 Lite: `800 x 1340`
- A7 Lite Chrome CSS 축소 뷰포트 대비: `600 x 960`

구매기록 첫 화면, 구매자 선택/얼굴인식, PIN/결제 확인, 운영관리 모바일 화면을 우선 지원 범위로 봅니다.

## Local Run

```bash
npm install
npm run dev
```

`GOOGLE_*` 환경변수가 비어 있으면 로컬에서는 메모리 저장소로 동작합니다. 이 모드에서도 구매, 관리자, PIN, 제안 흐름을 바로 테스트할 수 있습니다.

## Environment Variables

`.env.example`을 기준으로 설정합니다.

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `DEFAULT_MEMBER_PIN`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `SOLAPI_API_KEY`
- `SOLAPI_API_SECRET`
- `SOLAPI_SENDER`

## Required Google Sheets Tabs

- `ledger`
- `daily_summary`
- `member_summary`
- `cash_pending`
- `transfer_pending`
- `products`
- `members`
- `suggestions`
- `settings`
- `sync_queue`

앱은 시트가 비어 있으면 `members`와 `products` 탭을 PRD의 초기 데이터로 시드합니다.

## Main Flows

- `/kiosk`
  - 이름 선택
  - 얼굴 인식으로 이름 빠른 선택
  - PIN 확인
  - 품목/수량 선택
  - 현금 또는 계좌이체 선택
  - 5초 후 자동 복귀
- `/my-ledger`
  - 이름 + PIN으로 최근 구매 내역 조회
- `/suggestions`
  - 원하는 간식 제안 등록
- `/admin`
  - 비밀번호 로그인
  - 오늘 장부 요약
  - 현금/계좌이체 상태 업데이트
  - 상품 비활성화
  - PIN 초기화
  - 얼굴 등록
  - 연락처 저장
  - 체납 안내 문자 발신

## Messaging Note

- `apick.app`는 공식 공지 기준으로 2024년 8월 16일에 SMS 관련 API 서비스를 중단했습니다.
- 그래서 체납 발신은 현재 공식 문서와 Node SDK가 운영 중인 `SOLAPI` 기준으로 구현했습니다.

## Verification

- `npm run lint`
- `npm run build`
- Browser viewport checks: `600x960`, `800x1280`, `800x1340`

두 명령 모두 통과하도록 정리되어 있습니다.
