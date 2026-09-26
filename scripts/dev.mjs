import { createServer } from "vite";
import { handleGemini } from "../server/gemini.ts";
const server = await createServer({ server: { host: "127.0.0.1", port: 5174, strictPort: true }, plugins: [{ name: "panoramic-local-api", configureServer(server) {
server.middlewares.use("/api/gemini", async (req, res) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
    const options = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") { options.body = req; options.duplex = "half"; }
    const request = new Request(`http://127.0.0.1:5174/api/gemini`, options);
    const response = await handleGemini(request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch { res.writeHead(500); res.end(JSON.stringify({ error: "Local API request failed." })); }
});
} }] });
await server.listen();
server.printUrls();
