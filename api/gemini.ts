import { handleGemini } from "../server/gemini.ts";
declare const process: { env: Record<string, string | undefined> };
export default { fetch: (request: Request) => handleGemini(request, process.env) };
