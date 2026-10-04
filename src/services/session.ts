import Redis from "ioredis";

// Conexión singleton resiliente a Valkey / Redis
const valkeyUrl =
  process.env.VALKEY_URL ||
  process.env.valkey_connectionString ||
  "redis://valkey:6379";

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
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

export interface SessionChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

const SESSION_PREFIX = "chat:sessions:";
const DEFAULT_TTL_SECONDS = 86400; // 24 horas

/**
 * Obtiene el historial de conversación reciente para un número de teléfono.
 * Devuelve los mensajes en orden cronológico (más antiguo al más reciente).
 */
export async function getSessionHistory(
  phone: string,
  limit = 10
): Promise<SessionChatMessage[]> {
  try {
    const client = getRedisClient();
    const cleanPhone = phone.replace(/\D/g, "");
    const key = `${SESSION_PREFIX}${cleanPhone}`;

    // Obtenemos los últimos N mensajes (LPUSH guarda el más reciente en el índice 0)
    const rawItems = await client.lrange(key, 0, limit - 1);
    if (!rawItems || rawItems.length === 0) {
      return [];
    }

    const messages: SessionChatMessage[] = [];
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
        // Ignorar items corruptos
      }
    }

    // Invertir para devolver en orden cronológico ascendente para el LLM
    return messages.reverse();
  } catch (err: any) {
    console.error("[Valkey getSessionHistory Err]:", err.message);
    return [];
  }
}

/**
 * Agrega un mensaje a la sesión del usuario con ventana deslizante y TTL atómico.
 */
export async function appendSessionMessage(
  phone: string,
  role: "user" | "assistant",
  content: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const client = getRedisClient();
    const cleanPhone = phone.replace(/\D/g, "");
    const key = `${SESSION_PREFIX}${cleanPhone}`;

    const payload = JSON.stringify({
      role,
      content,
      timestamp: Date.now(),
    });

    const pipeline = client.pipeline();
    pipeline.lpush(key, payload);
    pipeline.ltrim(key, 0, 9); // Ventana deslizante fija de 10 mensajes
    pipeline.expire(key, ttlSeconds); // Renovación atómica de TTL
    await pipeline.exec();
  } catch (err: any) {
    console.error("[Valkey appendSessionMessage Err]:", err.message);
  }
}
