import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(_scrypt)

// Формат: scrypt$16384$8$1$<salt-hex>$<hash-hex>
// N=16384, r=8, p=1, keylen=64 — баланс безопасности и 512MB лимита Beget.
// Без внешних зависимостей (в отличие от bcryptjs), работает на Node 18+.
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64
const SALT_LEN = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  // scrypt с опциями N/r/p: типы @types/node для promisify не знают 4-й аргумент — каст any.
  const derived = (await (scryptAsync as unknown as (...a: unknown[]) => Promise<Buffer>)(
    password,
    salt,
    KEYLEN,
    { N, r: R, p: P },
  )) as Buffer
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Миграция с v1: "legacy_sha256$<sha256>" или голый sha256 -> verifyLegacySha256
  if (!stored.startsWith('scrypt$')) {
    const hash = stored.startsWith('legacy_sha256$') ? stored.slice('legacy_sha256$'.length) : stored
    return verifyLegacySha256(password, hash)
  }
  try {
    const [, n, r, p, saltHex, hashHex] = stored.split('$')
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const derived = (await (scryptAsync as unknown as (...a: unknown[]) => Promise<Buffer>)(
      password,
      salt,
      expected.length,
      {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      },
    )) as Buffer
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Проверяет старый хеш v1: SHA256(password + 'gramotagrad_salt_2026'). Нужен только для бесшовной миграции. */
function verifyLegacySha256(password: string, storedHash: string): boolean {
  const h = createHash('sha256').update(password + 'gramotagrad_salt_2026').digest('hex')
  if (h.length !== storedHash.length) return false
  try {
    return timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    return false
  }
}

/** true, если хеш старый и его нужно перехешировать в scrypt при следующем успешном логине. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith('scrypt$')
}
