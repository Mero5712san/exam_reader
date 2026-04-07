const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function extractUrl(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If the user pastes a full curl command, extract the first URL.
  const urlMatch = trimmed.match(/https?:\/\/[^\s"']+/i);
  return urlMatch ? urlMatch[0] : "";
}

function sanitizePath(urlPath) {
  if (urlPath === "/") return path.join(PUBLIC_DIR, "index.html");
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, "");
  return path.join(PUBLIC_DIR, safePath);
}

async function handleFetchExam(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) : {};

    const token = String(body.token || "").trim();
    const rawInput = String(body.url || "").trim();
    const targetUrl = extractUrl(rawInput);

    if (!targetUrl) {
      return sendJson(res, 400, { error: "Please provide a valid API URL or curl command." });
    }

    const headers = {
      "Accept": "application/json"
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers
    });

    const text = await upstream.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return sendJson(res, 502, {
        error: "Upstream response is not valid JSON.",
        status: upstream.status,
        preview: text.slice(0, 500)
      });
    }

    if (!upstream.ok) {
      return sendJson(res, 502, {
        error: "Upstream request failed.",
        status: upstream.status,
        response: parsed
      });
    }

    return sendJson(res, 200, { response: parsed });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && parsedUrl.pathname === "/api/fetch-exam") {
    return handleFetchExam(req, res);
  }

  if (req.method === "GET") {
    const filePath = sanitizePath(parsedUrl.pathname);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
    });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`ExamReader running at http://localhost:${PORT}`);
});
