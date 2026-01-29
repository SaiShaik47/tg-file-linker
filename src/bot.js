import TelegramBot from "node-telegram-bot-api";
import { CFG } from "./config.js";
import { newId, makeKey, nowIso } from "./tokens.js";

function pickFile(msg) {
  return (
    msg.document ||
    msg.video ||
    msg.audio ||
    msg.voice ||
    msg.animation ||
    msg.photo?.[msg.photo.length - 1]
  );
}

function safeName(msg, file) {
  if (file?.file_name) return file.file_name;
  if (msg.video) return "video.mp4";
  if (msg.animation) return "animation.mp4";
  if (msg.audio) return "audio.mp3";
  if (msg.voice) return "voice.ogg";
  if (msg.photo) return "photo.jpg";
  return "file.bin";
}

export function startBot(store) {
  const bot = new TelegramBot(CFG.BOT_TOKEN, { polling: true });

  const help = `Send me any file/video/document.
I will return:
• Stream link (Railway page with player)
• Download link

Commands:
• /start - help
• /setpass <password> - set password for NEXT link you create
• /clearp - clear password
• /revoke <id> - revoke a link (admin/owner)
`;

  // per-chat temporary password for next generated link
  const nextPassByChat = new Map();

  bot.onText(/\/start/, async (msg) => {
    await bot.sendMessage(msg.chat.id, help);
  });

  bot.onText(/\/setpass (.+)/, async (msg, m) => {
    const pass = (m?.[1] || "").trim();
    if (!pass) return bot.sendMessage(msg.chat.id, "Usage: /setpass yourPassword");
    nextPassByChat.set(msg.chat.id, pass);
    await bot.sendMessage(msg.chat.id, "✅ Password set for your NEXT link.");
  });

  bot.onText(/\/clearp/, async (msg) => {
    nextPassByChat.delete(msg.chat.id);
    await bot.sendMessage(msg.chat.id, "✅ Password cleared.");
  });

  bot.onText(/\/revoke (.+)/, async (msg, m) => {
    const id = (m?.[1] || "").trim();
    if (!id) return bot.sendMessage(msg.chat.id, "Usage: /revoke <id>");

    const isAdmin = CFG.ADMIN_ID && msg.from?.id === CFG.ADMIN_ID;
    const isOwner = msg.from?.id && msg.from.id === msg.chat.id; // private chat typical
    if (!isAdmin && !isOwner) {
      return bot.sendMessage(msg.chat.id, "❌ Not allowed.");
    }

    await store.del(makeKey(id));
    await bot.sendMessage(msg.chat.id, `✅ Revoked: ${id}`);
  });

  bot.on("message", async (msg) => {
    try {
      if (msg.text?.startsWith("/")) return;

      const file = pickFile(msg);
      if (!file) return;

      if (CFG.MAX_MB > 0 && file.file_size && file.file_size > CFG.MAX_MB * 1024 * 1024) {
        return bot.sendMessage(msg.chat.id, `❌ File too large (limit: ${CFG.MAX_MB} MB)`);
      }

      const fileId = file.file_id;
      const fileName = safeName(msg, file);

      const id = newId();
      const password = nextPassByChat.get(msg.chat.id) || null;

      const data = {
        id,
        fileId,
        fileName,
        ownerId: msg.from?.id || null,
        createdAt: nowIso(),
        password,
        kind: msg.document
          ? "document"
          : msg.video
            ? "video"
            : msg.photo
              ? "photo"
              : msg.audio
                ? "audio"
                : msg.voice
                  ? "voice"
                  : msg.animation
                    ? "animation"
                    : "file"
      };

      await store.set(makeKey(id), data, CFG.LINK_TTL_SEC);

      const streamUrl = `${CFG.BASE_URL}/s/${id}`;
      const downloadUrl = `${CFG.BASE_URL}/d/${id}`;
      const ttlH = Math.round(CFG.LINK_TTL_SEC / 3600);
      const passNote = password ? `\n🔒 Password: enabled (open stream link → enter password)` : "";

      // Inline buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: "▶️ Stream", url: streamUrl },
            { text: "⬇️ Download", url: downloadUrl }
          ],
          [{ text: "🔗 Copy Stream Link", url: streamUrl }]
        ]
      };

      await bot.sendMessage(
        msg.chat.id,
        `✅ Link ready\n\nID: ${id}\nType: ${data.kind}\nName: ${fileName}\n\n🎬 Stream:\n${streamUrl}\n\n⬇️ Download:\n${downloadUrl}\n\n⏳ Expires in ~${ttlH}h${passNote}`,
        { disable_web_page_preview: true, reply_markup: keyboard }
      );
    } catch (e) {
      console.error("bot message error:", e);
    }
  });

  bot.on("polling_error", (e) => console.error("polling_error:", e?.message || e));
  console.log("✅ Bot polling started");
  return bot;
}
