# Pocket Notes MCP

TypeScript로 만든 작고 읽기 쉬운 MCP 학습 프로젝트입니다. 로컬 JSON 메모장을
도메인으로 사용해 MCP의 핵심 기능과 주요 양방향 기능을 한 프로젝트에서 보여줍니다.

## 무엇을 배우나요?

| MCP 개념 | 이 프로젝트의 예 |
|---|---|
| Lifecycle / capability negotiation | SDK가 연결 시 자동 처리하며 테스트 Client에서 확인 |
| Tools | `list_notes`, `create_note`, `analyze_notes` |
| Structured output | Tool의 `outputSchema`와 `structuredContent` |
| Tool annotations | 읽기 전용, 멱등성, 파괴성 힌트 |
| Resources | `notes://catalog` |
| Resource templates | `notes://note/{id}` |
| Resource links | `create_note` 결과가 새 메모 URI를 반환 |
| Prompts | `review_note` |
| Completion | Prompt의 `noteId`/`style`, Resource의 `id` 추천 |
| Notifications | 메모 생성 후 Resource 목록 변경 알림 |
| Progress / cancellation | `analyze_notes` |
| Sampling | `summarize_note`가 Host의 모델에 요약 요청 |
| Elicitation | `create_note_interactive`가 사용자 입력 폼 요청 |
| Roots | `list_workspace_roots`가 Client의 작업 영역 요청 |
| Logging | 메모 생성 이벤트를 MCP Client에 전송 |

Tools, Resources, Prompts가 프로젝트의 본체입니다. Sampling, Elicitation, Roots는
MCP Client가 해당 capability를 선언했을 때만 작동하며, 지원하지 않는 Client에서는
이해하기 쉬운 오류 결과를 반환합니다.

## 요구사항

- Node.js 24 LTS 권장 (`.nvmrc` 제공)
- Node.js 22 LTS도 호환
- pnpm 10 이상

MCP TypeScript SDK v2의 분리 패키지를 사용합니다.

- `@modelcontextprotocol/server`: `McpServer`, 서버 전송, 서버 측 공용 타입
- `@modelcontextprotocol/client`: 테스트·smoke test용 `Client`와 클라이언트 전송
- `@modelcontextprotocol/core`: 공개 프로토콜 Zod 스키마

각 패키지는 `package.json`의 명시적 subpath export를 제공하므로 import 경로에
`.js` 확장자를 붙이지 않습니다.

## 시작하기

```bash
cd /Users/home/Projects/pocket-notes-mcp
pnpm install
pnpm check
```

개발 모드:

```bash
pnpm dev
```

아무 출력 없이 계속 실행되는 것이 정상입니다. stdio MCP 서버는 사람이 터미널에
입력하기를 기다리는 CLI가 아니라, MCP Host가 표준 입력으로 JSON-RPC 메시지를
보내기를 기다립니다. `stdout`은 MCP 메시지 전용이므로 디버그 출력은 `stderr`를
사용해야 합니다.

빌드된 서버 실행:

```bash
pnpm build
pnpm start
```

## MCP Host에 연결

Host 설정 형식은 제품마다 조금씩 다르지만 핵심 값은 같습니다.

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

`POCKET_NOTES_FILE`을 생략하면 서버 프로세스의 현재 작업 디렉터리를 기준으로
`data/notes.json`을 사용합니다. Host 설정에서는 절대 경로를 지정하는 편이
명확합니다.

## MCP Inspector로 확인

먼저 빌드합니다.

```bash
pnpm build
```

그다음 공식 Inspector로 서버를 실행합니다.

```bash
npx @modelcontextprotocol/inspector \
  node /Users/home/Projects/pocket-notes-mcp/dist/index.js
```

Inspector에서 다음 순서로 살펴보면 좋습니다.

1. `tools/list`에서 입력·출력 스키마와 annotations 확인
2. `list_notes` 호출 후 `structuredContent` 확인
3. `resources/list`와 `resources/templates/list` 확인
4. `notes://note/{id}` Resource 읽기
5. `prompts/list`와 `review_note` Prompt 확인
6. Completion 요청으로 `noteId` 추천 확인

Inspector나 Host가 Sampling, Elicitation, Roots를 지원하고 capability를 선언하면
해당 고급 Tool도 실행할 수 있습니다.

## 프로젝트 구조

```text
pocket-notes-mcp/
├── src/
│   ├── index.ts                 stdio 전송 연결
│   ├── server.ts                MCP 서버 조립과 instructions
│   ├── register-tools.ts        일반 Tools
│   ├── register-client-tools.ts Sampling, Elicitation, Roots Tools
│   ├── register-resources.ts    Resources와 Resource Template
│   ├── register-prompts.ts      Prompt와 Completion
│   ├── note-store.ts            JSON 파일 저장소
│   └── note.ts                  도메인 타입과 출력 변환
├── data/
│   └── notes.json               예제 데이터
├── tests/
│   ├── note-store.test.ts
│   ├── server.test.ts
│   └── client-capabilities.test.ts
├── scripts/
│   ├── clean.ts                 빌드 산출물 정리
│   └── stdio-smoke.ts           실제 stdio 연결 smoke test
├── package.json
└── tsconfig.json
```

파일은 MCP 개념별로 나눴지만 별도의 프레임워크나 DI 컨테이너, 데이터베이스,
라우터 계층은 추가하지 않았습니다. 학습에 필요하지 않은 추상화를 피하기 위한
의도적인 선택입니다.

## 코드 읽는 순서

### 1. 서버 실행

`src/index.ts`

```text
NoteStore 생성
→ McpServer 생성
→ StdioServerTransport 생성
→ server.connect()
```

### 2. Tool

`src/register-tools.ts`의 `list_notes`를 먼저 읽습니다.

```text
Zod inputSchema
→ Tool handler
→ NoteStore
→ content + structuredContent
```

다음으로 상태를 변경하는 `create_note`를 읽으면 Tool annotations와
Resource link, list-changed notification의 관계를 볼 수 있습니다.

### 3. Resource

`src/register-resources.ts`에서 고정 URI와 템플릿 URI를 비교합니다.

```text
notes://catalog
notes://note/{id}
```

### 4. Prompt와 Completion

`src/register-prompts.ts`의 `review_note`는 사용자가 명시적으로 선택하는
재사용 워크플로입니다. `completable()`이 유효한 메모 ID와 복습 스타일을
추천합니다.

### 5. 양방향 MCP

`summarize_note`, `create_note_interactive`, `list_workspace_roots`는 서버가 다시
Client에 요청을 보내는 예제입니다.

```text
Host/Client → Tool 호출 → MCP Server
                         ↓
                Sampling/Elicitation/Roots 요청
                         ↓
                    Host/Client 응답
```

## 테스트

```bash
pnpm test
```

테스트는 함수만 직접 호출하지 않습니다. SDK의 `InMemoryTransport`로 실제 MCP
Client와 Server를 연결해 다음 프로토콜 동작을 검증합니다.

- 초기화와 instructions 협상
- Tool 목록과 호출
- 구조화된 Tool 결과 검증
- Resource 목록과 읽기
- Prompt 목록과 조회
- Completion
- 미지원 capability의 안전한 실패
- Sampling, Elicitation, Roots의 실제 양방향 요청

전체 검증:

```bash
pnpm check
```

## 안전 경계

- 서버는 `POCKET_NOTES_FILE`로 지정한 JSON 파일만 읽고 씁니다.
- 메모 저장은 임시 파일을 만든 뒤 교체해 중간 상태의 JSON이 남지 않게 합니다.
- `create_note`는 변경 Tool이지만 기존 메모를 삭제하지 않습니다.
- Elicitation 폼에는 비밀번호, API 키 등 민감 정보를 입력하면 안 됩니다.
- Tool annotations는 힌트일 뿐이며, 실제 승인과 권한 관리는 MCP Host가 담당합니다.
- 원격 HTTP와 OAuth는 학습 범위를 흐리므로 포함하지 않았습니다. 다음 단계에서
  Streamable HTTP 서버로 확장할 때 추가하는 것이 좋습니다.

## 공식 자료

- [MCP 소개](https://modelcontextprotocol.io/docs/getting-started/intro)
- [MCP 서버 개념](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
