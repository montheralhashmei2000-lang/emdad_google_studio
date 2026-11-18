package com.imdad.erp.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Android Keystore Hardware-Backed SQLCipher Key Sealer, PBKDF2-HMAC-SHA256 (310,000 iterations),
 * AES-256-GCM Encrypted Backup (.imdbk) & LAN Sync Packet Crypto Engine.
 */
object SecurityEngine {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val MASTER_KEY_ALIAS = "imdad_sqlcipher_keystore_v31"
    private const val PREFS_NAME = "imdad_secure_keystore_prefs"
    private const val PREF_WRAPPED_DB_KEY = "wrapped_sqlcipher_key_v31"

    const val PBKDF2_ITERATIONS = 310_000
    const val LEGACY_PBKDF2_ITERATIONS = 10_000
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12

    private val secureRandom = SecureRandom()

    /**
     * Retrieves or generates a 256-bit (32-byte) SQLCipher passphrase sealed inside Android Hardware Keystore.
     */
    fun getOrCreateSqlCipherKey(context: Context): ByteArray {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val wrappedBase64 = prefs.getString(PREF_WRAPPED_DB_KEY, null)
        val masterKey = getOrCreateHardwareAesKey()

        if (wrappedBase64 != null) {
            return unwrapKeyWithKeystore(masterKey, wrappedBase64)
        }

        val rawDbKey = ByteArray(32)
        secureRandom.nextBytes(rawDbKey)
        val sealed = wrapKeyWithKeystore(masterKey, rawDbKey)
        prefs.edit().putString(PREF_WRAPPED_DB_KEY, sealed).apply()
        return rawDbKey
    }

    private fun getOrCreateHardwareAesKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = ks.getEntry(MASTER_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            MASTER_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGen.init(spec)
        return keyGen.generateKey()
    }

    private fun wrapKeyWithKeystore(masterKey: SecretKey, rawKey: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, masterKey)
        val iv = cipher.iv
        val encrypted = cipher.doFinal(rawKey)
        val combined = ByteArray(iv.size + encrypted.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun unwrapKeyWithKeystore(masterKey: SecretKey, wrappedBase64: String): ByteArray {
        val combined = Base64.decode(wrappedBase64, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, GCM_IV_BYTES)
        val cipherText = combined.copyOfRange(GCM_IV_BYTES, combined.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, masterKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(cipherText)
    }

    /**
     * PBKDF2-HMAC-SHA256 Password Hashing (310,000 iterations) with constant-time verification.
     */
    data class PasswordHashResult(
        val saltHex: String,
        val hashHex: String,
        val iterations: Int = PBKDF2_ITERATIONS,
    )

    fun hashPassword(
        password: String,
        saltHex: String? = null,
        iterations: Int = PBKDF2_ITERATIONS,
    ): PasswordHashResult {
        val salt = if (saltHex != null) hexToBytes(saltHex) else ByteArray(16).also { secureRandom.nextBytes(it) }
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
        val skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val derived = skf.generateSecret(spec).encoded
        spec.clearPassword()
        return PasswordHashResult(
            saltHex = bytesToHex(salt),
            hashHex = bytesToHex(derived),
            iterations = iterations,
        )
    }

    fun verifyPasswordConstantTime(
        password: String,
        saltHex: String,
        expectedHashHex: String,
        iterations: Int,
    ): Boolean {
        val computed = hashPassword(password, saltHex, iterations)
        val a = hexToBytes(computed.hashHex)
        val b = hexToBytes(expectedHashHex)
        return MessageDigest.isEqual(a, b)
    }

    /**
     * AES-256-GCM Encrypted Backup (.imdbk) & LAN Sync Packet Encryption
     */
    fun encryptAesGcmWithPassphrase(plainText: String, passphrase: String): String {
        val salt = ByteArray(16).also { secureRandom.nextBytes(it) }
        val iv = ByteArray(GCM_IV_BYTES).also { secureRandom.nextBytes(it) }
        val keyBytes = hexToBytes(hashPassword(passphrase, bytesToHex(salt), 100_000).hashHex)
        val secretKey = SecretKeySpec(keyBytes, "AES")

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        val cipherBytes = cipher.doFinal(plainText.toByteArray(StandardCharsets.UTF_8))

        val saltB64 = Base64.encodeToString(salt, Base64.NO_WRAP)
        val ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP)
        val ctB64 = Base64.encodeToString(cipherBytes, Base64.NO_WRAP)
        return "IMDAD_GCM_V31:$saltB64:$ivB64:$ctB64"
    }

    fun decryptAesGcmWithPassphrase(envelope: String, passphrase: String): String {
        val parts = envelope.split(":")
        require(parts.size == 4 && parts[0] == "IMDAD_GCM_V31") {
            "صيغة الحزمة المشفرة غير صالحة"
        }
        val salt = Base64.decode(parts[1], Base64.NO_WRAP)
        val iv = Base64.decode(parts[2], Base64.NO_WRAP)
        val cipherBytes = Base64.decode(parts[3], Base64.NO_WRAP)

        val keyBytes = hexToBytes(hashPassword(passphrase, bytesToHex(salt), 100_000).hashHex)
        val secretKey = SecretKeySpec(keyBytes, "AES")

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        val plainBytes = cipher.doFinal(cipherBytes)
        return String(plainBytes, StandardCharsets.UTF_8)
    }

    fun sha256Hex(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return bytesToHex(md.digest(input.toByteArray(StandardCharsets.UTF_8)))
    }

    fun bytesToHex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }

    fun hexToBytes(hex: String): ByteArray {
        val clean = hex.trim()
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) {
            val idx = i * 2
            out[i] = clean.substring(idx, idx + 2).toInt(16).toByte()
        }
        return out
    }
}
