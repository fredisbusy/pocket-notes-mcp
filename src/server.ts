import { McpServer } from "@modelcontextprotocol/server";
import type { NoteStore } from "./note-store";
import { registerPrompts } from "./register-prompts";
import { registerResources } from "./register-resources";
import { registerTools } from "./register-tools";

export function createServer(store: NoteStore): McpServer {
  const server = new McpServer(
    {
      name: "pocket-notes-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: [
        "Pocket Notes는 쉬운 장보기 메모로 MCP를 배우는 로컬 서버입니다.",
        "메모 ID를 모르면 먼저 list_notes를 사용하세요.",
        "전체 내용은 notes://note/{id} Resource로 읽으세요.",
        "새 장보기 메모는 설정된 로컬 JSON 파일에만 저장됩니다.",
        "Sampling, Elicitation, Roots Tool은 Client가 해당 기능을 지원할 때만 작동합니다.",
      ].join(" "),
    },
  );

  registerTools(server, store);
  registerResources(server, store);
  registerPrompts(server, store);
  return server;
}
