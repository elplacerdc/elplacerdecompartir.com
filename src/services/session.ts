import Redis from "ioredis";

const valkeyUrl =
  process.env.VALKEY_URL ||
  process.env.valkey_connectionString ||
  "redis://valkey:6379";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(valkeyUrl, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: false,
    });
    redisClient.on("error", (err) => {
      console.error("[Valkey Session Error]:", err.message);
    });
  }
  return redisClient;
}

const SESSION_PREFIX = "chat:sessions:";
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export async function getSessionHistory(
  phone: string,
  limit = 10
): Promise<SessionMessage[]> {
  try {
    const client = getRedisClient();
    const cleanPhone = String(phone).replace(/\D/g, "");
    const key = `${SESSION_PREFIX}${cleanPhone}`;
    const rawItems = await client.lrange(key, 0, limit - 1);
    if (!rawItems || rawItems.length === 0) {
      return [];
    }
    const messages: SessionMessage[] = [];
    for (const item of rawItems) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.role && parsed.content) {
          messages.push({
            role: parsed.role,
            content: parsed.content,
            timestamp: parsed.timestamp,
          });
        }
      } catch {
        // Ignorar items malformados
      }
    }
    return messages.reverse();
  } catch (err: any) {
    console.error("[Valkey getSessionHistory Err]:", err.message);
    return [];
  }
}

export async function appendSessionMessage(
  phone: string,
  role: "user" | "assistant" | "system",
  content: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const client = getRedisClient();
    const cleanPhone = String(phone).replace(/\D/g, "");
    const key = `${SESSION_PREFIX}${cleanPhone}`;
    const payload = JSON.stringify({
      role,
      content,
      timestamp: Date.now(),
    });
    const pipeline = client.pipeline();
    pipeline.lpush(key, payload);
    pipeline.ltrim(key, 0, 9);
    pipeline.expire(key, ttlSeconds);
    await pipeline.exec();
  } catch (err: any) {
    console.error("[Valkey appendSessionMessage Err]:", err.message);
  }
}

const HUMAN_TAKEOVER_PREFIX = "wa:human_takeover:";
const AFFILIATE_PITCHED_PREFIX = "wa:affiliate_pitched:";

export async function isHumanTakeover(
  phoneOrPhones: string | string[]
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const phones = Array.isArray(phoneOrPhones) ? phoneOrPhones : [phoneOrPhones];
    for (const p of phones) {
      if (!p) continue;
      const cleanPhone = String(p).replace(/\D/g, "");
      if (!cleanPhone) continue;
      const exists = await client.exists(`${HUMAN_TAKEOVER_PREFIX}${cleanPhone}`);
      if (exists === 1) {
        return true;
      }
    }
    return false;
  } catch (err: any) {
    console.error("[Valkey isHumanTakeover Err]:", err.message);
    return false;
  }
}

export async function setHumanTakeover(
  phoneOrPhones: string | string[],
  ttlSeconds = 7200
): Promise<void> {
  try {
    const client = getRedisClient();
    const phones = Array.isArray(phoneOrPhones) ? phoneOrPhones : [phoneOrPhones];
    const pipeline = client.pipeline();
    for (const p of phones) {
      if (!p) continue;
      const cleanPhone = String(p).replace(/\D/g, "");
      if (!cleanPhone) continue;
      pipeline.set(
        `${HUMAN_TAKEOVER_PREFIX}${cleanPhone}`,
        "1",
        "EX",
        ttlSeconds
      );
    }
    await pipeline.exec();
  } catch (err: any) {
    console.error("[Valkey setHumanTakeover Err]:", err.message);
  }
}

export async function clearHumanTakeover(
  phoneOrPhones: string | string[]
): Promise<void> {
  try {
    const client = getRedisClient();
    const phones = Array.isArray(phoneOrPhones) ? phoneOrPhones : [phoneOrPhones];
    const keys = phones
      .map((p) => (p ? `${HUMAN_TAKEOVER_PREFIX}${String(p).replace(/\D/g, "")}` : ""))
      .filter(Boolean);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (err: any) {
    console.error("[Valkey clearHumanTakeover Err]:", err.message);
  }
}

export async function isAffiliatePitched(
  phoneOrPhones: string | string[]
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const phones = Array.isArray(phoneOrPhones) ? phoneOrPhones : [phoneOrPhones];
    for (const p of phones) {
      if (!p) continue;
      const cleanPhone = String(p).replace(/\D/g, "");
      if (!cleanPhone) continue;
      const exists = await client.exists(`${AFFILIATE_PITCHED_PREFIX}${cleanPhone}`);
      if (exists === 1) {
        return true;
      }
    }
    return false;
  } catch (err: any) {
    console.error("[Valkey isAffiliatePitched Err]:", err.message);
    return false;
  }
}

export async function setAffiliatePitched(
  phoneOrPhones: string | string[],
  ttlSeconds = 604800
): Promise<void> {
  try {
    const client = getRedisClient();
    const phones = Array.isArray(phoneOrPhones) ? phoneOrPhones : [phoneOrPhones];
    const pipeline = client.pipeline();
    for (const p of phones) {
      if (!p) continue;
      const cleanPhone = String(p).replace(/\D/g, "");
      if (!cleanPhone) continue;
      pipeline.set(
        `${AFFILIATE_PITCHED_PREFIX}${cleanPhone}`,
        "1",
        "EX",
        ttlSeconds
      );
    }
    await pipeline.exec();
  } catch (err: any) {
    console.error("[Valkey setAffiliatePitched Err]:", err.message);
  }
}
