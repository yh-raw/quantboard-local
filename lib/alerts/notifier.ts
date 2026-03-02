import { AppError } from "@/lib/errors";
import type { AlertChannel } from "@prisma/client";

export type AlertDispatchPayload = {
  ticker: string;
  channel: AlertChannel;
  target: string | null;
  signalType: string;
  signalTs: string;
  signalPrice: number;
  subscriptionId: string;
};

function buildAlertMessage(payload: AlertDispatchPayload) {
  return [
    "QuantBoard Signal Alert",
    `Ticker: ${payload.ticker}`,
    `Signal: ${payload.signalType}`,
    `Time: ${payload.signalTs}`,
    `Price: ${payload.signalPrice.toFixed(2)}`,
    `Subscription: ${payload.subscriptionId}`,
  ].join("\n");
}

async function sendWebhookAlert(target: string, payload: AlertDispatchPayload) {
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: "signal_alert",
      title: "QuantBoard Signal Alert",
      message: buildAlertMessage(payload),
      data: payload,
    }),
  });

  if (!response.ok) {
    throw new AppError("WEBHOOK_SEND_FAILED", 502, `Webhook returned status ${response.status}`);
  }

  return `webhook_${response.status}`;
}

async function sendTelegramAlert(chatId: string, payload: AlertDispatchPayload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new AppError("MISSING_TELEGRAM_TOKEN", 500, "TELEGRAM_BOT_TOKEN is not configured");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildAlertMessage(payload),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new AppError("TELEGRAM_SEND_FAILED", 502, `Telegram returned status ${response.status}`);
  }

  return `telegram_${response.status}`;
}

export async function dispatchAlert(payload: AlertDispatchPayload) {
  const { channel, target } = payload;

  if (channel === "LOG") {
    const message = buildAlertMessage(payload);
    console.info("[alert-dispatch][LOG]", message);
    return { status: "SENT" as const, message: "logged_to_console" };
  }

  if (!target) {
    throw new AppError("MISSING_ALERT_TARGET", 400, `Target is required for channel ${channel}`);
  }

  if (channel === "WEBHOOK") {
    const message = await sendWebhookAlert(target, payload);
    return { status: "SENT" as const, message };
  }

  if (channel === "TELEGRAM") {
    const message = await sendTelegramAlert(target, payload);
    return { status: "SENT" as const, message };
  }

  throw new AppError("UNSUPPORTED_ALERT_CHANNEL", 400, `Unsupported alert channel: ${channel}`);
}
