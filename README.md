# Pocket Notes MCP

장보기 메모를 예제로 MCP를 쉽게 배우는 작은 TypeScript 프로젝트입니다.

익숙한 장보기 흐름만 알면 됩니다.

```text
장보기 메모 보기 → 새 메모 만들기 → 분류별로 확인 → 체크리스트 만들기
```

메모는 로컬 `data/notes.json` 파일에 저장됩니다. 데이터베이스나 외부 서비스는
사용하지 않습니다.

## 먼저 해볼 것

MCP Host에 서버를 연결한 뒤 아래처럼 요청해 보세요.

- "저장된 장보기 메모를 보여줘."
- "우유 1팩과 달걀 10개를 이번 주 장보기 메모로 저장해 줘."
- "식료품으로 분류된 메모만 보여줘."
- "이 메모를 매장에서 볼 체크리스트로 만들어 줘."

## 장보기로 배우는 MCP

| MCP 개념 | 장보기 예제 |
|---|---|
| Tools | 메모 보기, 만들기, 분류 확인 |
| Structured output | 장보기 메모 목록을 JSON 형태로 반환 |
| Resources | 저장된 메모 전체 또는 하나를 읽기 |
| Resource links | 새 메모를 만들면 바로 읽을 수 있는 URI 반환 |
| Prompts | 메모를 체크리스트·절약 목록·식사 계획으로 정리 |
| Completion | 메모 ID와 정리 방식을 추천 |
| Notifications | 새 메모가 생겼음을 Client에 알림 |
| Progress / cancellation | 여러 메모의 분류를 확인하는 진행 상황 |
| Multi-round-trip input | Sampling·Elicitation·Roots 입력을 받아 원 요청 재실행 |
| Subscriptions | `subscriptions/listen`으로 메모 목록 변경 알림 |
| Cache hints | 목록·Resource·Discovery 결과의 TTL과 공개 범위 |
| Logging | stdio의 `stderr`로 메모 생성 이벤트 기록 |

Tools, Resources, Prompts가 프로젝트의 핵심입니다. 최신 2026-07-28 프로토콜에서는
`server/discover`와 요청별 capability를 사용하고, Client 입력은 multi-round-trip
`input_required` 결과로 요청합니다. Sampling과 Roots는 deprecated 예제를 이해하기
위해 남겨 두었으며 Client가 해당 입력 요청을 지원할 때만 작동합니다.

## 주요 기능

### Tools

| 이름 | 하는 일 |
|---|---|
| `list_notes` | 저장된 장보기 메모 보기 |
| `create_note` | 새 장보기 메모 만들기 |
| `analyze_notes` | 분류별 메모 수 확인 |
| `summarize_note` | Host 모델로 메모를 짧게 정리 |
| `create_note_interactive` | 입력 폼으로 메모 만들기 |
| `list_workspace_roots` | Client가 공개한 작업 폴더 보기 |

### Resources

```text
notes://catalog
notes://note/{id}
```

`notes://catalog`는 전체 목록이고, `notes://note/{id}`는 메모 하나의 전체
내용입니다.

### Prompt

`prepare_shopping`은 저장된 메모를 다음 방식으로 정리합니다.

- `simple`: 살 것만 짧게
- `checklist`: 매장에서 체크할 목록으로
- `budget`: 꼭 필요한 것과 나중에 살 것으로
- `meal`: 만들 수 있는 식사와 빠진 재료로

## 실행하기

요구사항:

- Node.js 24 LTS 권장
- Node.js 22 LTS도 호환
- pnpm 10 이상

```bash
cd /Users/home/Projects/pocket-notes-mcp
pnpm install
pnpm check
```

개발 모드:

```bash
pnpm dev
```

아무 출력 없이 실행을 기다리는 것이 정상입니다. stdio MCP 서버는 터미널에서
직접 사용하는 CLI가 아니라 MCP Host의 JSON-RPC 메시지를 기다립니다.

빌드된 서버 실행:

```bash
pnpm build
pnpm start
```

## MCP Host에 연결하기

제품마다 설정 모양은 조금 다르지만 필요한 값은 같습니다.

```json
{
  "mcpServers": {
    "pocket-notes": {
      "command": "node",
      "args": [
        "/Users/home/Projects/pocket-notes-mcp/dist/index.js"
      ],
      "env": {
        "POCKET_NOTES_FILE": "/Users/home/Projects/pocket-notes-mcp/data/notes.json"
      }
    }
  }
}
```

`POCKET_NOTES_FILE`을 생략하면 현재 작업 폴더의 `data/notes.json`을 사용합니다.

## MCP Inspector로 살펴보기

```bash
pnpm build
npx @modelcontextprotocol/inspector \
  node /Users/home/Projects/pocket-notes-mcp/dist/index.js
```

Inspector에서는 다음 순서로 보면 쉽습니다.

1. `list_notes` Tool 호출
2. `notes://catalog` Resource 읽기
3. `create_note`로 메모 만들기
4. 반환된 `notes://note/{id}` 링크 읽기
5. `prepare_shopping` Prompt를 `checklist` 방식으로 실행

## 프로젝트 구조

```text
pocket-notes-mcp/
├── src/
│   ├── index.ts                 stdio 연결
│   ├── server.ts                MCP 서버 조립
│   ├── register-tools.ts        기본 Tools
│   ├── register-client-tools.ts Sampling, Elicitation, Roots
│   ├── register-resources.ts    장보기 Resources
│   ├── register-prompts.ts      장보기 Prompt와 Completion
│   ├── note-store.ts            JSON 파일 저장소
│   └── note.ts                  메모 타입과 Markdown 변환
├── data/
│   └── notes.json               장보기 예제
├── tests/                       실제 MCP 연결 테스트
└── scripts/
    └── stdio-smoke.ts           실제 프로세스 연결 확인
```

파일은 MCP 개념별로만 나눴습니다. 학습에 필요하지 않은 프레임워크, 데이터베이스,
DI 컨테이너는 넣지 않았습니다.

## 테스트

```bash
pnpm test
```

테스트는 함수만 따로 호출하지 않습니다. 실제 MCP Client와 Server를 메모리에서
연결해 Tool, Resource, Prompt, Completion과 양방향 기능을 확인합니다.

전체 검증:

```bash
pnpm check
```

## 안전 경계

- 서버는 `POCKET_NOTES_FILE`로 지정한 JSON 파일만 읽고 씁니다.
- 새 메모를 추가할 뿐 기존 메모를 삭제하지 않습니다.
- 저장 중 파일이 깨지지 않도록 임시 파일을 만든 뒤 교체합니다.
- 입력 폼에는 비밀번호나 API 키를 적지 마세요.
- 실제 승인과 권한 관리는 MCP Host가 담당합니다.

## 공식 자료

- [MCP 소개](https://modelcontextprotocol.io/docs/getting-started/intro)
- [MCP 서버 개념](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
