/**
 * crypto.ts — AES-256-GCM encryption for secrets
 */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const KEY_LENGTH = 32

function getSecretKey(): Buffer {
  const hex = process.env.WEAVE_SECRET_KEY
  if (!hex || hex.length !== KEY_LENGTH * 2) {
    throw new Error("Missing or invalid WEAVE_SECRET_KEY environment variable (expected 64 hex chars)")
  }
  return Buffer.from(hex, "hex")
}

export function encrypt(plaintext: string, aad: string): string {
  const key = getSecretKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(aad, "utf8"))

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Format: base64(IV + ciphertext + tag)
  return Buffer.concat([iv, encrypted, tag]).toString("base64")
}

export function decrypt(ciphertext: string, aad: string): string {
  const key = getSecretKey()
  const data = Buffer.from(ciphertext, "base64")

  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(data.length - 16)
  const encrypted = data.subarray(IV_LENGTH, data.length - 16)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 })
  decipher.setAAD(Buffer.from(aad, "utf8"))
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8")
}
