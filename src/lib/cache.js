import memjs from "memjs";
import pino from "pino";

const log = pino().child({ mod: "cache" });

// If MEMCACHED_ENDPOINT is not set, we no-op (stateless fallback)
let mc = null;
if (process.env.MEMCACHED_ENDPOINT) {
    mc = memjs.Client.create(process.env.MEMCACHED_ENDPOINT, { keepAlive: true });
    log.info({ endpoint: process.env.MEMCACHED_ENDPOINT }, "memcached client created");
} else {
    log.warn("MEMCACHED_ENDPOINT not set; cache disabled");
}

export async function cacheGet(key) {
    if (!mc) return null;
    try {
        const { value } = await mc.get(key);
        if (!value) { log.debug({ key }, "MISS"); return null;}
        log.debug({ key }, "HIT");
        return JSON.parse(value.toString());
    } catch {
        return null;
    }
}

export async function cacheSet(key, obj, ttlSeconds = 60) {
    if (!mc) return;
    try {
        await mc.set(key, Buffer.from(JSON.stringify(obj)), { expires: ttlSeconds });
    } catch {}
}

export async function cacheDel(key) {
    if (!mc) return;
    try{ 
        await mc.delete(key);
     } catch {}
}