import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SUPABASE_URL = 'https://nmpjteqgvhndrqcoxwrs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_90-Kedr2pSBoTHignMlQdw_uv03Fpl2';

// Legacy salt kept solely for one-time seamless migration of existing v1 license files
const LEGACY_SALT = 'JAI_DUBBER_PRO_SECURE_SALT_2026_VANDA_EDITION';

// Obfuscated master key segments (assembled at runtime)
const _K1 = [0x4a, 0x41, 0x49, 0x5f, 0x44, 0x55, 0x42, 0x42, 0x45, 0x52, 0x5f];
const _K2 = [0x56, 0x41, 0x4e, 0x44, 0x41, 0x5f, 0x53, 0x45, 0x43, 0x55, 0x52, 0x45];
const _K3 = [0x5f, 0x41, 0x45, 0x53, 0x32, 0x35, 0x36, 0x5f, 0x32, 0x30, 0x32, 0x36];

function getMasterSecret(): string {
  return Buffer.from([..._K1, ..._K2, ..._K3]).toString('utf8');
}

export interface LicenseInfo {
  isActivated: boolean;
  licenseKey?: string;
  customerName?: string;
  customerContact?: string;
  planType?: string;
  activatedAt?: string;
  expiresAt?: string | null;
  machineId: string;
  daysRemaining?: number | null;
  message?: string;
  securityToken?: string;
}

// Cached hardware identifiers so we don't spawn child processes on every call
let _cachedMachineId: string | null = null;
let _cachedHwFingerprint: string | null = null;
let _cachedAesKey: Buffer | null = null;

// In-memory verification cache for high-speed Backend API Guard middleware
let _memoryAuthCache: {
  valid: boolean;
  checkedAt: number;
  message?: string;
} | null = null;

const MEMORY_CACHE_TTL_MS = 60 * 1000; // Re-verify every 60s for backend API calls
const MAX_OFFLINE_TRIAL_MS = 2 * 60 * 60 * 1000; // 2 hours max offline for 1-day trial
const MAX_OFFLINE_PAID_MS = 72 * 60 * 60 * 1000; // 72 hours (3 days) max offline for paid plans
const CLOCK_DRIFT_TOLERANCE_MS = 15 * 60 * 1000; // 15 minutes tolerance

/**
 * Retrieves the unique Hardware ID (Machine GUID) of this computer.
 * Keeps standard UUID format for 100% compatibility with existing licenses & Telegram Bot.
 */
export function getMachineId(): string {
  if (_cachedMachineId) return _cachedMachineId;

  try {
    if (process.platform === 'win32') {
      const stdout = execSync(
        'reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000, windowsHide: true }
      );
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9\-]+)/i);
      if (match && match[1]) {
        _cachedMachineId = match[1].trim().toLowerCase();
        return _cachedMachineId;
      }
    }
  } catch {}

  // Fallback deterministic UUID-formatted hardware ID
  const fallbackStr = `${os.hostname()}-${os.platform()}-${os.arch()}-${process.env.USERNAME || process.env.USER || 'vanda'}`;
  const hash = crypto.createHash('sha256').update(fallbackStr).digest('hex');
  _cachedMachineId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  return _cachedMachineId;
}

/**
 * Multi-Factor Hardware Fingerprint combining Registry MachineGuid, BIOS/Motherboard UUID,
 * CPU Model & Cores, and Architecture. Used to bind local AES-256-GCM encryption to this exact machine.
 */
function getHardwareFingerprint(): string {
  if (_cachedHwFingerprint) return _cachedHwFingerprint;

  const machineId = getMachineId();
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo && cpuInfo.length > 0 ? `${cpuInfo[0].model}:${cpuInfo.length}` : 'unknown-cpu';
  let biosId = 'default-bios';

  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'reg query HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS /v BaseBoardProduct',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 1500, windowsHide: true }
      );
      const match = out.match(/BaseBoardProduct\s+REG_SZ\s+(.+)/i);
      if (match && match[1]) {
        biosId = match[1].trim().toLowerCase();
      }
    } catch {}
  }

  const raw = `${machineId}|${biosId}|${cpuModel}|${os.platform()}|${os.arch()}`;
  _cachedHwFingerprint = crypto.createHash('sha256').update(raw).digest('hex');
  return _cachedHwFingerprint;
}

function getDerivedAesKey(): Buffer {
  if (_cachedAesKey) return _cachedAesKey;
  const master = getMasterSecret();
  const hwFp = getHardwareFingerprint();
  _cachedAesKey = crypto.scryptSync(`${master}::${hwFp}`, `JAIDUB_HW_SALT_${hwFp.slice(0, 16)}`, 32);
  return _cachedAesKey;
}

function getLicenseFilePath(): string {
  return path.join(os.homedir(), '.jaidubber_license.dat');
}

function computeLegacySignature(payload: string): string {
  return crypto.createHmac('sha256', LEGACY_SALT).update(payload).digest('hex');
}

function computeV2Hmac(envelopeStr: string): string {
  return crypto.createHmac('sha256', getDerivedAesKey()).update(envelopeStr).digest('hex');
}

/**
 * Encrypts and saves the license data using hardware-bound AES-256-GCM + HMAC.
 */
function saveLocalLicense(data: any) {
  try {
    const filePath = getLicenseFilePath();
    const key = getDerivedAesKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const payloadObj = {
      ...data,
      hwFp: getHardwareFingerprint(),
      lastSeenAt: Math.max(Date.now(), Number(data.lastSeenAt || 0)),
    };

    const plaintext = JSON.stringify(payloadObj);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const ivHex = iv.toString('hex');
    const tagHex = authTag.toString('hex');
    const encB64 = encrypted.toString('base64');

    const sig = computeV2Hmac(`v2:${ivHex}:${tagHex}:${encB64}`);

    const wrapper = {
      v: 2,
      iv: ivHex,
      tag: tagHex,
      enc: encB64,
      sig,
    };

    fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2), 'utf8');
  } catch (err) {
    console.error('[License] Error saving encrypted license file:', err);
  }
}

/**
 * Reads, decrypts, and verifies the local license file.
 * Supports automatic migration from v1 to v2 AES-256-GCM.
 */
function readLocalLicense(): any | null {
  try {
    const filePath = getLicenseFilePath();
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    const currentMachineId = getMachineId();
    let data: any = null;

    // --- V2 AES-256-GCM Format ---
    if (parsed.v === 2 && parsed.iv && parsed.tag && parsed.enc && parsed.sig) {
      const expectedSig = computeV2Hmac(`v2:${parsed.iv}:${parsed.tag}:${parsed.enc}`);
      if (expectedSig !== parsed.sig) {
        console.warn('[License] V2 HMAC integrity check failed (tampering or hardware mismatch)!');
        return null;
      }

      try {
        const key = getDerivedAesKey();
        const iv = Buffer.from(parsed.iv, 'hex');
        const authTag = Buffer.from(parsed.tag, 'hex');
        const encrypted = Buffer.from(parsed.enc, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        data = JSON.parse(decrypted);
      } catch (decErr) {
        console.warn('[License] AES-256-GCM decryption failed (hardware fingerprint mismatch)!');
        return null;
      }

      if (data.hwFp && data.hwFp !== getHardwareFingerprint()) {
        console.warn('[License] Multi-factor hardware fingerprint mismatch!');
        return null;
      }
    }
    // --- Legacy V1 Format (Seamless one-time upgrade to V2) ---
    else if (parsed.data && parsed.signature) {
      const expectedSig = computeLegacySignature(parsed.data);
      if (expectedSig !== parsed.signature) {
        console.warn('[License] Legacy signature mismatch!');
        return null;
      }
      data = JSON.parse(Buffer.from(parsed.data, 'base64').toString('utf8'));
      if (data && data.machineId && data.machineId.toLowerCase() === currentMachineId) {
        // Automatically upgrade to V2 AES-256-GCM on disk
        saveLocalLicense({
          ...data,
          machineId: currentMachineId,
          lastSeenAt: Date.now(),
        });
      }
    } else {
      return null;
    }

    if (!data || !data.machineId || data.machineId.toLowerCase() !== currentMachineId) {
      console.warn('[License] Machine ID mismatch on local license file.');
      return null;
    }

    // --- Anti-Clock Rollback Check ---
    const now = Date.now();
    const lastSeen = Number(data.lastSeenAt || 0);
    const verifiedAtMs = data.verifiedAt ? new Date(data.verifiedAt).getTime() : 0;
    const referencePast = Math.max(lastSeen, Number.isFinite(verifiedAtMs) ? verifiedAtMs : 0);

    if (referencePast > 0 && now < referencePast - CLOCK_DRIFT_TOLERANCE_MS) {
      console.warn('[License] System clock rollback detected!');
      return { ...data, clockTampered: true };
    }

    // Check expiration against current clock
    if (data.expiresAt) {
      const expDate = new Date(data.expiresAt);
      if (Number.isFinite(expDate.getTime()) && now > expDate.getTime()) {
        console.warn('[License] License has expired:', data.expiresAt);
        return { ...data, isExpired: true };
      }
    }

    return data;
  } catch (err) {
    console.error('[License] Error reading local license:', err);
    return null;
  }
}

/**
 * Generates a runtime security token for frontend verification.
 */
function generateSecurityToken(licenseKey: string, machineId: string): string {
  const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
  return crypto
    .createHmac('sha256', getDerivedAesKey())
    .update(`${licenseKey}:${machineId}:${hourBucket}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Checks the current license status with live Supabase sync, server time verification,
 * anti-clock rollback, and bounded offline lease.
 */
export async function getLicenseStatus(): Promise<LicenseInfo> {
  const machineId = getMachineId();
  const local = readLocalLicense();

  if (local) {
    if (local.isExpired) {
      deactivateLicense();
      _memoryAuthCache = { valid: false, checkedAt: Date.now(), message: 'License Key នេះបានផុតកំណត់ហើយ!' };
      return {
        isActivated: false,
        licenseKey: local.licenseKey,
        customerName: local.customerName,
        planType: local.planType,
        expiresAt: local.expiresAt,
        machineId,
        message: 'License Key នេះបានផុតកំណត់ហើយ! សូមបន្តសុពលភាពថ្មី។',
      };
    }

    // Always attempt live verification with Supabase online
    try {
      const url = `${SUPABASE_URL}/rest/v1/rpc/verify_license`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_license_key: local.licenseKey,
          p_machine_id: machineId,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        // Extract real UTC time from Supabase HTTP Date header to defeat local clock manipulation
        const serverDateStr = response.headers.get('date');
        const serverNowMs =
          serverDateStr && Number.isFinite(new Date(serverDateStr).getTime())
            ? new Date(serverDateStr).getTime()
            : Date.now();

        const liveResult: any = await response.json();

        // Guard against fake loopback responses: valid Supabase RPC response must be an object with boolean `success`
        if (!liveResult || typeof liveResult.success !== 'boolean') {
          throw new Error('Invalid RPC response format');
        }

        if (!liveResult.success) {
          console.warn('[License] Live sync: Key is invalid or revoked on Supabase:', liveResult?.message);
          deactivateLicense();
          _memoryAuthCache = {
            valid: false,
            checkedAt: Date.now(),
            message: liveResult?.message || 'License ត្រូវបានលុប ឬផ្អាកដំណើរការដោយ Admin!',
          };
          return {
            isActivated: false,
            machineId,
            message: liveResult?.message || 'License ត្រូវបានលុប ឬផ្អាកដំណើរការដោយ Admin!',
          };
        }

        const effectiveExpiresAt =
          liveResult.expires_at !== undefined ? liveResult.expires_at : local.expiresAt;

        // Verify expiration against trusted Server UTC Time
        if (effectiveExpiresAt) {
          const expMs = new Date(effectiveExpiresAt).getTime();
          if (Number.isFinite(expMs) && serverNowMs > expMs) {
            deactivateLicense();
            _memoryAuthCache = { valid: false, checkedAt: Date.now(), message: 'License Key បានផុតកំណត់ហើយ!' };
            return {
              isActivated: false,
              machineId,
              message: 'License Key នេះបានផុតកំណត់ហើយ! សូមបន្តសុពលភាពថ្មី។',
            };
          }
        }

        // Live check passed: update encrypted local cache with trusted server timestamp
        const updatedLocal = {
          ...local,
          customerName: liveResult.customer_name || local.customerName,
          planType: liveResult.plan_type || local.planType,
          expiresAt: effectiveExpiresAt,
          verifiedAt: new Date(serverNowMs).toISOString(),
          lastSeenAt: Math.max(Date.now(), serverNowMs),
          clockTampered: false,
        };
        saveLocalLicense(updatedLocal);

        let daysRemaining: number | null = null;
        if (updatedLocal.expiresAt) {
          const diff = new Date(updatedLocal.expiresAt).getTime() - serverNowMs;
          daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }

        _memoryAuthCache = { valid: true, checkedAt: Date.now() };

        return {
          isActivated: true,
          licenseKey: updatedLocal.licenseKey,
          customerName: updatedLocal.customerName,
          customerContact: updatedLocal.customerContact,
          planType: updatedLocal.planType,
          activatedAt: updatedLocal.activatedAt,
          expiresAt: updatedLocal.expiresAt,
          machineId,
          daysRemaining,
          securityToken: generateSecurityToken(updatedLocal.licenseKey, machineId),
          message: 'License ត្រឹមត្រូវ និងមានសុពលភាព!',
        };
      }
    } catch (netErr: any) {
      console.warn('[License] Live network check failed, evaluating offline lease:', netErr?.message);
    }

    // --- Offline Fallback Evaluation ---
    // 1. Reject offline access if system clock rollback was detected
    if (local.clockTampered) {
      _memoryAuthCache = {
        valid: false,
        checkedAt: Date.now(),
        message: 'រកឃើញការកែប្រែម៉ោងកុំព្យូទ័រខុសប្រក្រតី! សូមភ្ជាប់អ៊ីនធឺណិតដើម្បីផ្ទៀងផ្ទាត់ License។',
      };
      return {
        isActivated: false,
        machineId,
        message: '⚠️ រកឃើញការកែប្រែម៉ោងកុំព្យូទ័រខុសប្រក្រតី! សូមភ្ជាប់អ៊ីនធឺណិតដើម្បីផ្ទៀងផ្ទាត់ License ឡើងវិញ។',
      };
    }

    // 2. Enforce Offline Grace Period Lease
    const verifiedAtMs = local.verifiedAt ? new Date(local.verifiedAt).getTime() : 0;
    const isTrial = ['1day', 'trial'].includes(String(local.planType || '').toLowerCase());
    const maxOfflineMs = isTrial ? MAX_OFFLINE_TRIAL_MS : MAX_OFFLINE_PAID_MS;

    if (!verifiedAtMs || Date.now() - verifiedAtMs > maxOfflineMs) {
      _memoryAuthCache = {
        valid: false,
        checkedAt: Date.now(),
        message: 'សូមភ្ជាប់អ៊ីនធឺណិតដើម្បីផ្ទៀងផ្ទាត់សុពលភាព License!',
      };
      return {
        isActivated: false,
        machineId,
        message: '🌐 សូមភ្ជាប់អ៊ីនធឺណិតមួយភ្លែត ដើម្បីផ្ទៀងផ្ទាត់សុពលភាព License Key របស់អ្នក!',
      };
    }

    // Update monotonic lastSeenAt
    saveLocalLicense({ ...local, lastSeenAt: Date.now() });

    let daysRemaining: number | null = null;
    if (local.expiresAt) {
      const diff = new Date(local.expiresAt).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    _memoryAuthCache = { valid: true, checkedAt: Date.now() };

    return {
      isActivated: true,
      licenseKey: local.licenseKey,
      customerName: local.customerName,
      customerContact: local.customerContact,
      planType: local.planType,
      activatedAt: local.activatedAt,
      expiresAt: local.expiresAt,
      machineId,
      daysRemaining,
      securityToken: generateSecurityToken(local.licenseKey, machineId),
      message: 'License ត្រឹមត្រូវ និងមានសុពលភាព (Offline Mode)!',
    };
  }

  _memoryAuthCache = {
    valid: false,
    checkedAt: Date.now(),
    message: 'កម្មវិធីមិនទាន់បាន Activate នៅឡើយទេ!',
  };

  return {
    isActivated: false,
    machineId,
    message: 'កម្មវិធីមិនទាន់បាន Activate នៅឡើយទេ!',
  };
}

/**
 * Fast license check for Express API middleware guard.
 * Uses short-lived memory cache (60s) to keep batch TTS/Transcribe requests fast (<0.1ms)
 * while still enforcing strict backend license protection.
 */
export async function isLicenseCurrentlyValid(): Promise<{ valid: boolean; message?: string }> {
  if (_memoryAuthCache && Date.now() - _memoryAuthCache.checkedAt < MEMORY_CACHE_TTL_MS) {
    return { valid: _memoryAuthCache.valid, message: _memoryAuthCache.message };
  }
  const status = await getLicenseStatus();
  return { valid: status.isActivated, message: status.message };
}

/**
 * Activates a license key with Supabase and binds it to this machine.
 */
export async function activateLicense(licenseKey: string): Promise<{ success: boolean; message: string; data?: any }> {
  if (!licenseKey || !licenseKey.trim()) {
    return { success: false, message: 'សូមបញ្ចូល License Key!' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const machineId = getMachineId();

  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/verify_license`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_license_key: cleanKey,
        p_machine_id: machineId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[License] Supabase error response:', response.status, errText);
      return { success: false, message: `កំហុសបណ្តាញ Server (${response.status})។ សូមពិនិត្យមើលអ៊ីនធឺណិត!` };
    }

    const serverDateStr = response.headers.get('date');
    const serverNowMs =
      serverDateStr && Number.isFinite(new Date(serverDateStr).getTime())
        ? new Date(serverDateStr).getTime()
        : Date.now();

    const result: any = await response.json();

    if (!result || typeof result.success !== 'boolean' || !result.success) {
      return {
        success: false,
        message: result?.message || 'License Key មិនត្រឹមត្រូវទេ!',
      };
    }

    // Save verified license locally with AES-256-GCM hardware-bound encryption
    const localData = {
      licenseKey: cleanKey,
      customerName: result.customer_name || 'VIP User',
      customerContact: result.customer_contact || '',
      planType: result.plan_type || '1month',
      machineId,
      activatedAt: result.activated_at || new Date(serverNowMs).toISOString(),
      expiresAt: result.expires_at || null,
      verifiedAt: new Date(serverNowMs).toISOString(),
      lastSeenAt: Math.max(Date.now(), serverNowMs),
    };
    saveLocalLicense(localData);
    _memoryAuthCache = { valid: true, checkedAt: Date.now() };

    return {
      success: true,
      message: result.message || 'បាន Activate កម្មវិធីដោយជោគជ័យ!',
      data: localData,
    };
  } catch (err: any) {
    console.error('[License] Activation request failed:', err);
    return {
      success: false,
      message: `មិនអាចភ្ជាប់ទៅកាន់ Server បានទេ (${err.message})។ សូមពិនិត្យមើលការតភ្ជាប់អ៊ីនធឺណិតរបស់អ្នក!`,
    };
  }
}

/**
 * Deactivates and clears the local license.
 */
export function deactivateLicense(): { success: boolean; message: string } {
  try {
    _memoryAuthCache = { valid: false, checkedAt: Date.now(), message: 'បានដក License ចេញហើយ!' };
    const filePath = getLicenseFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true, message: 'បានដក License ចេញដោយជោគជ័យ!' };
  } catch (err: any) {
    return { success: false, message: `កំហុសក្នុងការដក License: ${err.message}` };
  }
}

