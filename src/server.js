import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import TelegramBot from "node-telegram-bot-api";

import { CFG } from "./config.js";
import { createStore } from "./storage.js";
import { makeKey } from "./tokens.js";
import { startBot } from "./bot.js";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { translateTime: "SYS:standard", ignore: "pid,hostname" }
    }
  }
});

await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

const store = createStore(CFG.REDIS_URL);
console.log(`🧠 Store: ${store.kind}`);

startBot(store);

const tg = new TelegramBot(CFG.BOT_TOKEN);

app.get("/", async () => ({
  ok: true,
  service: "tg-file-linker",
  store: store.kind,
  routes: ["/s/:id (stream page)", "/v/:id (video source)", "/d/:id (download)"]
}));

function passwordHtml(id, mode) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Protected</title>
<style>
body{font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0b0f17;color:#e9eef7}
.card{width:92%;max-width:420px;background:#121a2a;border:1px solid #24314c;border-radius:16px;padding:20px}
input,button{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #2b3a5a;background:#0b1222;color:#e9eef7;font-size:16px}
button{margin-top:12px;cursor:pointer}
</style></head>
<body>
<div class="card">
<h2 style="margin:0 0 10px">Enter password</h2>
<form method="POST" action="/p/${mode}/${id}">
  <input name="pass" placeholder="Password" type="password" required />
  <button type="submit">Unlock</button>
</form>
</div></body></html>`;
}

function playerHtml(id, fileName) {
  const title = fileName || "Stream";
  return `<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
body{margin:0;background:#0b0f17;color:#e9eef7;font-family:system-ui}
.wrap{max-width:980px;margin:0 auto;padding:16px}
.card{background:#121a2a;border:1px solid #24314c;border-radius:16px;padding:14px}
video{width:100%;height:auto;border-radius:12px;background:#000}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.btn{display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid #2b3a5a;background:#0b1222;text-decoration:none;color:#e9eef7}
</style></head>
<body>
<div class="wrap">
  <h2 style="margin:0 0 12px">${title}</h2>
  <div class="card">
    <video controls playsinline preload="metadata">
      <source src="/v/${id}">
      Your browser does not support video.
    </video>
    <div class="row">
      <a class="btn" href="/d/${id}">⬇️ Download</a>
      <a class="btn" href="/v/${id}" target="_blank">🔗 Direct Stream</a>
    </div>
    <p style="opacity:.7;font-size:13px;margin:12px 4px 0">Page hosted on Railway. Video bytes served by Telegram CDN.</p>
  </div>
</div>
</body></html>`;
}

async function resolve(id) {
  const row = await store.get(makeKey(id));
  if (!row) {
    const err = new Error("Link expired or revoked");
    err.statusCode = 410;
    throw err;
  }
  return row;
}

async function getTelegramUrl(fileId) {
  return tg.getFileLink(fileId);
}

app.get("/s/:id", async (req, reply) => {
  try {
    const id = req.params.id;
    const row = await resolve(id);

    if (row.password) return reply.type("text/html").send(passwordHtml(id, "s"));

    return reply.type("text/html").send(playerHtml(id, row.fileName));
  } catch (e) {
    reply.code(e.statusCode || 400).send({ ok: false, error: e.message });
  }
});

app.get("/v/:id", async (req, reply) => {
  try {
    const id = req.params.id;
    const row = await resolve(id);

    if (row.password) {
      reply.code(401).send({ ok: false, error: "Password required. Open stream page first." });
      return;
    }

    const url = await getTelegramUrl(row.fileId);
    reply.redirect(url);
  } catch (e) {
    reply.code(e.statusCode || 400).send({ ok: false, error: e.message });
  }
});

app.get("/d/:id", async (req, reply) => {
  try {
    const id = req.params.id;
    const row = await resolve(id);

    if (row.password) return reply.type("text/html").send(passwordHtml(id, "d"));

    const url = await getTelegramUrl(row.fileId);
    reply.header("Content-Disposition", `attachment; filename="${row.fileName || "file"}"`);
    reply.redirect(url);
  } catch (e) {
    reply.code(e.statusCode || 400).send({ ok: false, error: e.message });
  }
});

app.register(async function (f) {
  f.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, function (req, body, done) {
    const params = new URLSearchParams(body);
    done(null, Object.fromEntries(params.entries()));
  });

  f.post("/p/s/:id", async (req, reply) => {
    try {
      const id = req.params.id;
      const row = await resolve(id);
      const pass = (req.body?.pass || "").trim();

      if (!pass || pass !== row.password) return reply.code(401).type("text/html").send(passwordHtml(id, "s"));

      return reply.type("text/html").send(playerHtml(id, row.fileName));
    } catch (e) {
      reply.code(e.statusCode || 400).send({ ok: false, error: e.message });
    }
  });

  f.post("/p/d/:id", async (req, reply) => {
    try {
      const id = req.params.id;
      const row = await resolve(id);
      const pass = (req.body?.pass || "").trim();

      if (!pass || pass !== row.password) return reply.code(401).type("text/html").send(passwordHtml(id, "d"));

      const url = await getTelegramUrl(row.fileId);
      reply.header("Content-Disposition", `attachment; filename="${row.fileName || "file"}"`);
      return reply.redirect(url);
    } catch (e) {
      reply.code(e.statusCode || 400).send({ ok: false, error: e.message });
    }
  });
});

app.listen({ port: CFG.PORT, host: "0.0.0.0" });