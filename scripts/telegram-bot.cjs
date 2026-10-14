/**
 * JAI DUBBER - Telegram License Manager Bot
 * Automatically generates, checks, revokes, and lists Hardware-bound License Keys.
 */

const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8621465790:AAFXsZMtVwiN9ALv6kjU-T1xBo8_R-29bmg';
// Authorized Admin Telegram IDs (supports multiple admins)
const ADMIN_USER_IDS = ['5539122351', '7830506724'];

const SUPABASE_URL = 'https://nmpjteqgvhndrqcoxwrs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_90-Kedr2pSBoTHignMlQdw_uv03Fpl2';
const ADMIN_SECRET = 'JAI_ADMIN_SECRET_2026';

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// State tracking for waiting admin inputs
const userStates = {};

// Local store file for offline backup and quick lookup
const STORE_FILE = path.join(__dirname, 'bot_licenses_store.json');

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Store Error] Read error:', err.message);
  }
  return [];
}

function saveStore(data) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Store Error] Save error:', err.message);
  }
}

function saveLicenseRecord(rec) {
  const list = loadStore();
  const idx = list.findIndex(
    (x) => x.license_key === rec.license_key || (rec.machine_id && x.machine_id === rec.machine_id)
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...rec };
  } else {
    list.unshift(rec);
  }
  // Keep up to 200 items in store
  saveStore(list.slice(0, 200));
}

function updateLicenseRecordStatus(query, isActive) {
  const list = loadStore();
  const q = String(query).trim().toLowerCase();
  let found = false;
  for (const item of list) {
    if (
      (item.license_key && item.license_key.toLowerCase() === q) ||
      (item.machine_id && item.machine_id.toLowerCase() === q)
    ) {
      item.is_active = isActive;
      found = true;
    }
  }
  if (found) {
    saveStore(list);
  }
  return found;
}

function findInStore(query) {
  const list = loadStore();
  const q = String(query).trim().toLowerCase();
  return list.find(
    (x) =>
      (x.license_key && x.license_key.toLowerCase() === q) ||
      (x.machine_id && x.machine_id.toLowerCase() === q)
  );
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(String(userId));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function tgRequest(method, data = {}) {
  try {
    const url = `${TELEGRAM_API}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`[Telegram Error] ${method}:`, JSON.stringify(json));
    }
    return json;
  } catch (err) {
    console.error(`[Network Error] ${method}:`, err.message);
    return null;
  }
}

function normalizePlanType(rawPlan) {
  if (!rawPlan) return '1month';
  const p = String(rawPlan).trim().toLowerCase().replace(/\s+/g, '').replace(/[-_]/g, '');

  // Lifetime
  if (['lifetime', 'life', 'forever', 'perm', 'permanent', 'ទិញដាច់', 'ដាច់', 'ពេញមួយជីវិត'].includes(p)) {
    return 'lifetime';
  }

  // 1 Year / 12 Months
  if (['1year', '1years', '1y', 'yearly', 'year', '12m', '12month', '12months', '1ឆ្នាំ', '១ឆ្នាំ', '12ខែ', '១២ខែ'].includes(p)) {
    return '1year';
  }

  // 6 Months
  if (['6month', '6months', '6m', '6', '៦', '6ខែ', '៦ខែ', 'halfyear', 'half-year'].includes(p)) {
    return '6month';
  }

  // 3 Months
  if (['3month', '3months', '3m', '3', '៣', '3ខែ', '៣ខែ', 'quarter'].includes(p)) {
    return '3month';
  }

  // 1 Month
  if (['1month', '1months', '1m', '1', '១', 'monthly', 'month', '1ខែ', '១ខែ', '30d', '30days', '30ថ្ងៃ', '៣០ថ្ងៃ'].includes(p)) {
    return '1month';
  }

  // 1 Week
  if (['1week', '1weeks', '1w', 'weekly', 'week', '7d', '7days', '1សប្តាហ៍', '១សប្តាហ៍', '7ថ្ងៃ', '៧ថ្ងៃ'].includes(p)) {
    return '1week';
  }

  // 1 Day / Trial
  if (['1day', '1days', '1d', 'day', 'daily', 'trial', '1ថ្ងៃ', '១ថ្ងៃ', 'សាកល្បង'].includes(p)) {
    return '1day';
  }

  if (/^(3|៣)(m|month|ខែ)/.test(p)) return '3month';
  if (/^(6|៦)(m|month|ខែ)/.test(p)) return '6month';
  if (/^(1|១)(y|year|ឆ្នាំ)/.test(p)) return '1year';
  if (/^(1|១)(w|week|សប្តាហ៍)/.test(p)) return '1week';
  if (/^(1|១)(d|day|ថ្ងៃ)/.test(p)) return '1day';
  if (/^(1|១)(m|month|ខែ)/.test(p)) return '1month';

  return '1month';
}

// Generate License via Supabase RPC
async function generateLicense(machineId, planType = '1month', customerName = 'VIP Customer') {
  const canonicalPlan = normalizePlanType(planType);
  const url = `${SUPABASE_URL}/rest/v1/rpc/admin_generate_license`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_admin_secret: ADMIN_SECRET,
      p_machine_id: machineId.trim(),
      p_plan_type: canonicalPlan,
      p_customer_name: customerName.trim(),
    }),
  });

  const data = await res.json();
  if (data && data.success) {
    saveLicenseRecord({
      license_key: data.license_key,
      machine_id: data.machine_id,
      customer_name: data.customer_name,
      plan_type: data.plan_type,
      expires_at: data.expires_at,
      is_active: true,
      created_at: new Date().toISOString(),
    });
  }
  return data;
}

// List Recent Licenses via Supabase RPC or Local Store fallback
async function listLicenses(limit = 10) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/admin_list_licenses`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_admin_secret: ADMIN_SECRET,
        p_limit: limit,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.success && Array.isArray(result.data)) {
        // Sync local cache
        for (const item of result.data) {
          saveLicenseRecord(item);
        }
        return { success: true, data: result.data };
      }
    }
  } catch (err) {
    console.warn('[List RPC] Error calling admin_list_licenses:', err.message);
  }

  // Fallback to local store
  const localList = loadStore().slice(0, limit);
  return { success: true, data: localList, isLocal: true };
}

// Check License via Supabase RPC or verify_license or Local Store
async function checkLicense(query) {
  const cleanQ = query.trim();

  // 1. Try admin_check_license RPC
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/admin_check_license`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_admin_secret: ADMIN_SECRET,
        p_query: cleanQ,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.success && result.data) {
        saveLicenseRecord(result.data);
        return { success: true, data: result.data };
      }
    }
  } catch (err) {
    console.warn('[Check RPC] Error:', err.message);
  }

  // 2. Try verify_license RPC if query looks like a key
  if (cleanQ.toUpperCase().startsWith('JAIDUB-')) {
    try {
      const vUrl = `${SUPABASE_URL}/rest/v1/rpc/verify_license`;
      const vRes = await fetch(vUrl, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_license_key: cleanQ.toUpperCase(),
          p_machine_id: 'LOOKUP_CHECK',
        }),
      });

      if (vRes.ok) {
        const vData = await vRes.json();
        // If it returns MACHINE_MISMATCH, the key exists!
        if (vData.code === 'MACHINE_MISMATCH' || vData.code === 'ACTIVE') {
          const localItem = findInStore(cleanQ);
          return {
            success: true,
            data: {
              license_key: cleanQ.toUpperCase(),
              customer_name: vData.customer_name || localItem?.customer_name || 'អតិថិជន',
              machine_id: localItem?.machine_id || 'បានចងភ្ជាប់រួច',
              plan_type: vData.plan_type || localItem?.plan_type || '1month',
              is_active: true,
              expires_at: vData.expires_at || localItem?.expires_at,
            },
          };
        } else if (vData.code === 'KEY_REVOKED') {
          return {
            success: true,
            data: {
              license_key: cleanQ.toUpperCase(),
              is_active: false,
              revoked: true,
            },
          };
        } else if (vData.code === 'KEY_EXPIRED') {
          return {
            success: true,
            data: {
              license_key: cleanQ.toUpperCase(),
              is_active: true,
              is_expired: true,
              expires_at: vData.expires_at,
            },
          };
        }
      }
    } catch {}
  }

  // 3. Fallback to local store
  const local = findInStore(cleanQ);
  if (local) {
    return { success: true, data: local, isLocal: true };
  }

  return { success: false, message: 'រកមិនឃើញ License នេះក្នុងប្រព័ន្ធទេ!' };
}

// Revoke License via Supabase RPC
async function revokeLicense(query) {
  const cleanQ = query.trim();

  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/admin_revoke_license`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_admin_secret: ADMIN_SECRET,
        p_query: cleanQ,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.success) {
        updateLicenseRecordStatus(cleanQ, false);
        return result;
      }
      return result || { success: false, message: 'បរាជ័យក្នុងការផ្អាក License លើ Cloud!' };
    } else {
      const errBody = await res.json().catch(() => ({}));
      console.error('[Revoke RPC Failed]: Status', res.status, errBody);
      if (res.status === 404) {
        return {
          success: false,
          message: '⚠️ មិនទាន់មាន Function admin_revoke_license ក្នុង Supabase ទេ!\n\n👉 សូម Copy កូដ SQL ពី scripts/supabase_admin_functions.sql ទៅ Run ក្នុង Supabase SQL Editor ជាមុនសិន។',
        };
      }
      return {
        success: false,
        message: `កំហុសពី Supabase Cloud (${res.status}): ${errBody.message || 'Error'}`,
      };
    }
  } catch (err) {
    console.warn('[Revoke RPC] Error:', err.message);
    return {
      success: false,
      message: `បញ្ហាតភ្ជាប់ Network ទៅ Supabase: ${err.message}`,
    };
  }
}

// Restore / Reactivate License via Supabase RPC
async function restoreLicense(query) {
  const cleanQ = query.trim();

  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/admin_restore_license`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_admin_secret: ADMIN_SECRET,
        p_query: cleanQ,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.success) {
        updateLicenseRecordStatus(cleanQ, true);
        return result;
      }
      return result || { success: false, message: 'បរាជ័យក្នុងការបើកដំណើរការ License ឡើងវិញ!' };
    } else {
      const errBody = await res.json().catch(() => ({}));
      if (res.status === 404) {
        return {
          success: false,
          message: '⚠️ មិនទាន់មាន Function admin_restore_license ក្នុង Supabase ទេ!\n\n👉 សូម Run កូដក្នុង Supabase SQL Editor ជាមុនសិន។',
        };
      }
      return {
        success: false,
        message: `កំហុសពី Supabase Cloud (${res.status}): ${errBody.message || 'Error'}`,
      };
    }
  } catch (err) {
    console.warn('[Restore RPC] Error:', err.message);
    return {
      success: false,
      message: `បញ្ហាតភ្ជាប់ Network: ${err.message}`,
    };
  }
}

function formatPlanName(plan) {
  if (!plan) return 'មិនបានបញ្ជាក់';
  const canonical = normalizePlanType(plan);
  switch (canonical) {
    case '1day':
      return '⚡ Trial (១ ថ្ងៃ)';
    case '1week':
      return '📅 1 Week (១ សប្តាហ៍)';
    case '1month':
      return '⏳ 1 Month (១ ខែ / ៣០ ថ្ងៃ)';
    case '3month':
      return '🥉 3 Months (៣ ខែ / ៩០ ថ្ងៃ)';
    case '6month':
      return '🥈 6 Months (៦ ខែ / ១៨០ ថ្ងៃ)';
    case '1year':
      return '🥇 1 Year (១ ឆ្នាំ / ៣៦៥ ថ្ងៃ)';
    case 'lifetime':
      return '🌟 Lifetime (ទិញដាច់ គ្មានថ្ងៃផុតកំណត់)';
    default:
      return plan;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '♾️ គ្មានថ្ងៃផុតកំណត់ (Lifetime)';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('km-KH', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

function buildSuccessMessageHtml(data) {
  const expStr = formatDate(data.expires_at);
  const planStr = formatPlanName(data.plan_type);

  return (
    `🎉 <b>បង្កើត LICENSE KEY ជោគជ័យ!</b>\n\n` +
    `🔑 <b>License Key:</b>\n` +
    `<code>${escapeHtml(data.license_key)}</code>\n` +
    `<i>(ចុចលើ Key ដើម្បី Copy យកទៅប្រើ)</i>\n\n` +
    `🖥️ <b>Machine ID:</b> <code>${escapeHtml(data.machine_id)}</code>\n` +
    `👤 <b>អតិថិជន:</b> <b>${escapeHtml(data.customer_name || 'VIP Customer')}</b>\n` +
    `⏳ <b>គម្រោង:</b> ${planStr}\n` +
    `📅 <b>ផុតកំណត់នៅ:</b> ${expStr}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📌 <b>របៀបផ្ញើឱ្យភ្ញៀវ៖</b>\n` +
    `1. បើកកម្មវិធី <b>JAI DUBBER</b>\n` +
    `2. Copy License Key ខាងលើរួច Paste ចូលក្នុងប្រអប់\n` +
    `3. ចុចប៊ូតុង <b>ACTIVATE LICENSE</b>\n\n` +
    `<i>🔒 សម្គាល់៖ Key នេះដំណើរការបានតែលើកុំព្យូទ័រនេះមួយគត់!</i>`
  );
}

// -------------------------------------------------------------
// EXACT 3-ROW MAIN KEYBOARD (Matched with user-uploaded image)
// Row 1: [ ➕ បង្កើត License Key ថ្មី ]  [ 📋 បញ្ជី Key ថ្មីៗ ]
// Row 2: [ 🔍 ពិនិត្យ License (Check) ]  [ 🚫 ផ្អាក License (Revoke) ]
// Row 3: [ ℹ️ ជំនួយ (Help) ]
// -------------------------------------------------------------
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '➕ បង្កើត License Key ថ្មី' }, { text: '📋 បញ្ជី Key ថ្មីៗ' }],
    [{ text: '🔍 ពិនិត្យ License (Check)' }, { text: '🚫 ផ្អាក License (Revoke)' }],
    [{ text: 'ℹ️ ជំនួយ (Help)' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
};

function getPlanInlineKeyboard(machineId) {
  return {
    inline_keyboard: [
      [
        { text: '⚡ Trial 1 ថ្ងៃ (1day)', callback_data: `g:1day:${machineId}` },
        { text: '📅 1 សប្តាហ៍ (1week)', callback_data: `g:1week:${machineId}` },
      ],
      [
        { text: '⏳ 1 ខែ (1month)', callback_data: `g:1month:${machineId}` },
        { text: '🥉 3 ខែ (3month)', callback_data: `g:3month:${machineId}` },
      ],
      [
        { text: '🥈 6 ខែ (6month)', callback_data: `g:6month:${machineId}` },
        { text: '🥇 1 ឆ្នាំ (1year)', callback_data: `g:1year:${machineId}` },
      ],
      [{ text: '🌟 Lifetime (ទិញដាច់)', callback_data: `g:lifetime:${machineId}` }],
      [{ text: '❌ បោះបង់ (Cancel)', callback_data: 'cancel' }],
    ],
  };
}

// Handle All Incoming Messages
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const fromId = String(msg.from?.id);
  const fromUser = msg.from?.username || msg.from?.first_name || 'Admin';
  const text = msg.text ? msg.text.trim() : '';

  // Security Check
  if (!isAdmin(fromId)) {
    console.warn(`[Security] Unauthorized access attempt from User ID: ${fromId} (@${fromUser})`);
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `⛔ <b>សុំទោស! អ្នកគ្មានសិទ្ធិគ្រប់គ្រង Bot នេះទេ!</b>\n\n` +
        `Telegram ID របស់អ្នកគឺ: <code>${escapeHtml(fromId)}</code>\n` +
        `សូមទាក់ទងម្ចាស់គម្រោងដើម្បីបន្ថែម ID នេះចូលក្នុងបញ្ជី Admin។`,
      parse_mode: 'HTML',
    });
    return;
  }

  // -----------------------------------------------------------
  // 1. HELP / START (/start, /help, or "ℹ️ ជំនួយ (Help)")
  // -----------------------------------------------------------
  if (text === '/start' || text === '/help' || text === 'ℹ️ ជំនួយ (Help)') {
    delete userStates[fromId];
    const helpMsg =
      `👋 <b>សួស្តី Admin ${escapeHtml(fromUser)}!</b>\n` +
      `សូមស្វាគមន៍មកកាន់ <b>JAI DUBBER License Manager Bot</b> 🤖\n\n` +
      `📌 <b>មុខងារលើប៊ូតុងទាំង ៥ (Button Functions):</b>\n\n` +
      `➕ <b>បង្កើត License Key ថ្មី៖</b>\n` +
      `ចុចដើម្បីបញ្ចូល Machine ID និងជ្រើសរើសគម្រោង (1day, 1week, 1month, 3month, 6month, 1year, lifetime)។\n\n` +
      `📋 <b>បញ្ជី Key ថ្មីៗ៖</b>\n` +
      `បង្ហាញបញ្ជី License Keys ចុងក្រោយដែលបានបង្កើត ព្រមទាំងស្ថានភាព និងថ្ងៃផុតកំណត់។\n\n` +
      `🔍 <b>ពិនិត្យ License (Check)៖</b>\n` +
      `ត្រួតពិនិត្យព័ត៌មានលម្អិតរបស់ Key ឬ Machine ID (Valid, Expired, Revoked)។\n\n` +
      `🚫 <b>ផ្អាក License (Revoke)៖</b>\n` +
      `បិទដំណើរការ ឬផ្អាក License Key មិនឱ្យកុំព្យូទ័រនោះប្រើបានទៀតឡើយ។\n\n` +
      `ℹ️ <b>ជំនួយ (Help)៖</b>\n` +
      `បង្ហាញការណែនាំ និងបញ្ជីពាក្យបញ្ជា (Commands) ទាំងអស់។\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>Commands ផ្លូវកាត់៖</b>\n` +
      `• <code>/gen &lt;machine_id&gt; &lt;plan&gt; [ឈ្មោះ]</code>\n` +
      `• <code>/list</code>\n` +
      `• <code>/check &lt;key_or_machine&gt;</code>\n` +
      `• <code>/revoke &lt;key_or_machine&gt;</code>\n\n` +
      `💡 <i>Tip: លោកអ្នកអាចគ្រាន់តែ Copy & Paste Machine ID ចូលមកទីនេះភ្លាមៗបាន!</i>`;

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: helpMsg,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // CANCEL COMMAND (Text)
  // -----------------------------------------------------------
  if (text.toLowerCase() === 'cancel' || text === 'បោះបង់' || text === '/cancel') {
    delete userStates[fromId];
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ <b>បានបោះបង់ប្រតិបត្តិការ។</b>\n\n👇 សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖',
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // 2. BUTTON: "➕ បង្កើត License Key ថ្មី" (Also backwards compatible with old labels)
  // -----------------------------------------------------------
  if (
    text === '➕ បង្កើត License Key ថ្មី' ||
    text === '🔑 បង្កើត License Key' ||
    text === '⚡ Generate Key'
  ) {
    userStates[fromId] = 'WAITING_MACHINE_ID';
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `➕ <b>បង្កើត LICENSE KEY ថ្មី</b>\n\n` +
        `📥 <b>សូមផ្ញើ Machine ID របស់ភ្ញៀវចូលមកទីនេះ៖</b>\n\n` +
        `<i>ឧទាហរណ៍៖</i> <code>767012c8-6cb7-4360-b56d-5ffde610e913</code>\n\n` +
        `<i>(💡 ភ្ញៀវអាច Copy Machine ID ពីក្នុងផ្ទាំង Activation Lock នៃកម្មវិធី JAI DUBBER ផ្ញើមកលោកអ្នក)</i>`,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // 3. BUTTON: "📋 បញ្ជី Key ថ្មីៗ" or command /list
  // -----------------------------------------------------------
  if (text === '📋 បញ្ជី Key ថ្មីៗ' || text === '/list') {
    delete userStates[fromId];
    await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' });

    const result = await listLicenses(8);
    const list = result.data || [];

    if (!list.length) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text:
          `📋 <b>បញ្ជី LICENSE KEYS ថ្មីៗ</b>\n\n` +
          `ℹ️ មិនទាន់មានទិន្នន័យ License ណាមួយត្រូវបានបង្កើតនៅឡើយទេ។\n\n` +
          `👉 ចុចប៊ូតុង <b>➕ បង្កើត License Key ថ្មី</b> ដើម្បីបង្កើត Key ដំបូង!`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }

    let listMsg = `📋 <b>បញ្ជី LICENSE KEYS ថ្មីៗ (${list.length})៖</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    list.forEach((item, index) => {
      const planStr = formatPlanName(item.plan_type);
      const expStr = formatDate(item.expires_at);
      const isRevoked = item.is_active === false;
      const isExpired = item.expires_at && new Date(item.expires_at) < new Date();

      let statusBadge = '🟢 <b>សកម្ម (Active)</b>';
      if (isRevoked) statusBadge = '🚫 <b>បានផ្អាក (Revoked)</b>';
      else if (isExpired) statusBadge = '🔴 <b>ផុតកំណត់ (Expired)</b>';

      listMsg +=
        `<b>${index + 1}.</b> 🔑 <code>${escapeHtml(item.license_key)}</code>\n` +
        `👤 <b>${escapeHtml(item.customer_name || 'អតិថិជន')}</b> | ⏳ ${planStr}\n` +
        `🖥️ <code>${escapeHtml(item.machine_id || 'N/A')}</code>\n` +
        `📊 ស្ថានភាព: ${statusBadge}\n` +
        `📅 ផុតកំណត់: <code>${expStr}</code>\n\n`;
    });

    listMsg += `━━━━━━━━━━━━━━━━━━━━\n💡 <i>ចុចលើ License Key ដើម្បី Copy យកទៅប្រើ</i>`;

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: listMsg,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // 4. BUTTON: "🔍 ពិនិត្យ License (Check)"
  // -----------------------------------------------------------
  if (text === '🔍 ពិនិត្យ License (Check)') {
    userStates[fromId] = 'WAITING_CHECK_KEY';
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `🔍 <b>ពិនិត្យមើល LICENSE KEY (CHECK)</b>\n\n` +
        `សូមផ្ញើ <b>License Key</b> ឬ <b>Machine ID</b> ដែលលោកអ្នកចង់ត្រួតពិនិត្យចូលមកទីនេះ៖\n\n` +
        `<i>ឧទាហរណ៍៖</i>\n` +
        `• Key: <code>JAIDUB-60E5-05A9-B5E4</code>\n` +
        `• Machine ID: <code>767012c8-6cb7-4360-b56d-5ffde610e913</code>`,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // 5. BUTTON: "🚫 ផ្អាក License (Revoke)"
  // -----------------------------------------------------------
  if (text === '🚫 ផ្អាក License (Revoke)') {
    userStates[fromId] = 'WAITING_REVOKE_KEY';
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `🚫 <b>ផ្អាកដំណើរការ LICENSE KEY (REVOKE)</b>\n\n` +
        `សូមផ្ញើ <b>License Key</b> ឬ <b>Machine ID</b> ដែលលោកអ្នកចង់ផ្អាក (Revoke)៖\n\n` +
        `<i>⚠️ ការផ្អាកនេះនឹងបិទដំណើរការកម្មវិធី JAI DUBBER លើម៉ាស៊ីននោះភ្លាមៗ!</i>`,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // -----------------------------------------------------------
  // 6. COMMAND: /check <query>
  // -----------------------------------------------------------
  if (text.startsWith('/check')) {
    const parts = text.split(/\s+/);
    const query = parts[1];
    if (!query) {
      userStates[fromId] = 'WAITING_CHECK_KEY';
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `🔍 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់ពិនិត្យ៖</b>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    await processCheckLicense(chatId, query);
    return;
  }

  // -----------------------------------------------------------
  // 7. COMMAND: /revoke <query>
  // -----------------------------------------------------------
  if (text.startsWith('/revoke')) {
    const parts = text.split(/\s+/);
    const query = parts[1];
    if (!query) {
      userStates[fromId] = 'WAITING_REVOKE_KEY';
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `🚫 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់ផ្អាក៖</b>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    await promptRevokeConfirmation(chatId, query);
    return;
  }

  // -----------------------------------------------------------
  // 7b. COMMAND: /restore <query>
  // -----------------------------------------------------------
  if (text.startsWith('/restore')) {
    const parts = text.split(/\s+/);
    const query = parts[1];
    if (!query) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `🟢 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់បើកដំណើរការឡើងវិញ៖</b>\n\nឧទាហរណ៍៖ <code>/restore 767012c8-6cb7-4360-b56d-5ffde610e913</code>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' });
    const res = await restoreLicense(query);
    if (res && res.success) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text:
          `✅ <b>បានបើកដំណើរការ (RESTORE) LICENSE ឡើងវិញជោគជ័យ!</b>\n\n` +
          `🔑 <b>Key:</b> <code>${escapeHtml(res.license_key || query)}</code>\n` +
          `🖥️ <b>Machine:</b> <code>${escapeHtml(res.machine_id || 'N/A')}</code>\n` +
          `👤 <b>អតិថិជន:</b> <b>${escapeHtml(res.customer_name || 'អតិថិជន')}</b>\n` +
          `🟢 <b>ស្ថានភាព:</b> <b>សកម្មឡើងវិញ (Active)</b>\n\n` +
          `<i>កុំព្យូទ័រនេះអាចបើកប្រើប្រាស់កម្មវិធី JAI DUBBER បានជាធម្មតាឡើងវិញហើយ។</i>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    } else {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចបើកដំណើរការឡើងវិញបានទេ!')}`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    }
    return;
  }

  // -----------------------------------------------------------
  // 8. COMMAND: /gen <machine_id> [plan] [customer]
  // -----------------------------------------------------------
  if (text.startsWith('/gen')) {
    delete userStates[fromId];
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text:
          `⚠️ <b>សូមបញ្ជាក់ Machine ID!</b>\n\n` +
          `ទម្រង់៖ <code>/gen &lt;machine_id&gt; &lt;plan&gt; [ឈ្មោះ]</code>\n\n` +
          `ឧទាហរណ៍៖\n<code>/gen 767012c8-6cb7-4360-b56d-5ffde610e913 1month សុខា</code>\n\n` +
          `💡 ឬគ្រាន់តែផ្ញើ Machine ID ចូលមក ដើម្បីជ្រើសរើស Button!`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }

    const machineId = parts[1];
    const plan = parts[2] || null;
    const customerName = parts.slice(3).join(' ') || 'VIP Customer';

    if (!plan) {
      const keyboard = getPlanInlineKeyboard(machineId);
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `🖥️ <b>Machine ID:</b> <code>${escapeHtml(machineId)}</code>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `👇 <b>សូមចុចលើ Button ខាងក្រោមដើម្បីជ្រើសរើសគម្រោង៖</b>`,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    }

    await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' });

    try {
      const res = await generateLicense(machineId, plan, customerName);
      if (res && res.success) {
        await tgRequest('sendMessage', {
          chat_id: chatId,
          text: buildSuccessMessageHtml(res),
          parse_mode: 'HTML',
          reply_markup: MAIN_KEYBOARD,
        });
      } else {
        await tgRequest('sendMessage', {
          chat_id: chatId,
          text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចបង្កើត License បានទេ!')}`,
          parse_mode: 'HTML',
          reply_markup: MAIN_KEYBOARD,
        });
      }
    } catch (err) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `❌ <b>កំហុស Server:</b> ${escapeHtml(err.message)}`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    }
    return;
  }

  // -----------------------------------------------------------
  // 8b. HANDLE STATE: WAITING_CUSTOMER_NAME
  // -----------------------------------------------------------
  if (userStates[fromId] && (userStates[fromId].action === 'WAITING_CUSTOMER_NAME' || userStates[fromId] === 'WAITING_CUSTOMER_NAME')) {
    const stateData = typeof userStates[fromId] === 'object' ? userStates[fromId] : {};
    const machineId = stateData.machineId;
    const plan = stateData.plan || '1month';
    delete userStates[fromId];

    const customerName = text.trim() || 'អតិថិជន';

    if (machineId) {
      await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' });
      try {
        const res = await generateLicense(machineId, plan, customerName);
        if (res && res.success) {
          await tgRequest('sendMessage', {
            chat_id: chatId,
            text: buildSuccessMessageHtml(res),
            parse_mode: 'HTML',
            reply_markup: MAIN_KEYBOARD,
          });
        } else {
          await tgRequest('sendMessage', {
            chat_id: chatId,
            text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចបង្កើត License បានទេ!')}`,
            parse_mode: 'HTML',
            reply_markup: MAIN_KEYBOARD,
          });
        }
      } catch (err) {
        await tgRequest('sendMessage', {
          chat_id: chatId,
          text: `❌ <b>កំហុស Server:</b> ${escapeHtml(err.message)}`,
          parse_mode: 'HTML',
          reply_markup: MAIN_KEYBOARD,
        });
      }
      return;
    }
  }

  // -----------------------------------------------------------
  // 9. HANDLE STATE: WAITING_CHECK_KEY
  // -----------------------------------------------------------
  if (userStates[fromId] === 'WAITING_CHECK_KEY') {
    delete userStates[fromId];
    await processCheckLicense(chatId, text);
    return;
  }

  // -----------------------------------------------------------
  // 10. HANDLE STATE: WAITING_REVOKE_KEY
  // -----------------------------------------------------------
  if (userStates[fromId] === 'WAITING_REVOKE_KEY') {
    delete userStates[fromId];
    await promptRevokeConfirmation(chatId, text);
    return;
  }

  // -----------------------------------------------------------
  // 11. PATTERN DETECTION: JAIDUB-XXXX... (Direct Check)
  // -----------------------------------------------------------
  if (text.toUpperCase().startsWith('JAIDUB-')) {
    delete userStates[fromId];
    await processCheckLicense(chatId, text);
    return;
  }

  // -----------------------------------------------------------
  // 12. PATTERN DETECTION: UUID (Machine ID)
  // -----------------------------------------------------------
  const uuidMatch = text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  if (uuidMatch) {
    const extractedId = uuidMatch[0];
    delete userStates[fromId];
    const keyboard = getPlanInlineKeyboard(extractedId);

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `🖥️ <b>បានទទួល Machine ID:</b>\n<code>${escapeHtml(extractedId)}</code>`,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `👇 <b>សូមចុចលើ Button ខាងក្រោមដើម្បីជ្រើសរើសគម្រោង៖</b>`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return;
  }

  // -----------------------------------------------------------
  // 13. HANDLE STATE: WAITING_MACHINE_ID (Alphanumeric machine id)
  // -----------------------------------------------------------
  if (userStates[fromId] === 'WAITING_MACHINE_ID') {
    delete userStates[fromId];
    if (/^[a-z0-9\-]{16,64}$/i.test(text)) {
      const keyboard = getPlanInlineKeyboard(text);
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `🖥️ <b>បានទទួល Machine ID:</b>\n<code>${escapeHtml(text)}</code>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `👇 <b>សូមចុចលើ Button ខាងក្រោមដើម្បីជ្រើសរើសគម្រោង៖</b>`,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    }
  }

  // -----------------------------------------------------------
  // DEFAULT FALLBACK
  // -----------------------------------------------------------
  await tgRequest('sendMessage', {
    chat_id: chatId,
    text:
      `ℹ️ <b>សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖</b>\n\n` +
      `• <b>➕ បង្កើត License Key ថ្មី</b> - បង្កើត Key ចងភ្ជាប់ Machine ID\n` +
      `• <b>📋 បញ្ជី Key ថ្មីៗ</b> - មើលបញ្ជី License ទាំងអស់\n` +
      `• <b>🔍 ពិនិត្យ License (Check)</b> - ពិនិត្យសុពលភាព Key\n` +
      `• <b>🚫 ផ្អាក License (Revoke)</b> - ផ្អាក / បិទ Key\n` +
      `• <b>ℹ️ ជំនួយ (Help)</b> - ការណែនាំលម្អិត`,
    parse_mode: 'HTML',
    reply_markup: MAIN_KEYBOARD,
  });
}

// Helper: Process License Check Display
async function processCheckLicense(chatId, query) {
  await tgRequest('sendChatAction', { chat_id: chatId, action: 'typing' });
  const result = await checkLicense(query);

  if (!result || !result.success || !result.data) {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `❌ <b>រកមិនឃើញ LICENSE!</b>\n\n` +
        `ពាក្យស្វែងរក: <code>${escapeHtml(query)}</code>\n\n` +
        `<i>សូមពិនិត្យមើល License Key ឬ Machine ID ម្តងទៀត។</i>`,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const lic = result.data;
  const isRevoked = lic.is_active === false || lic.revoked === true;
  const isExpired = lic.is_expired || (lic.expires_at && new Date(lic.expires_at) < new Date());

  let statusBadge = '🟢 <b>សកម្ម (Active)</b>';
  if (isRevoked) {
    statusBadge = '🚫 <b>បានផ្អាក (Revoked / Inactive)</b>';
  } else if (isExpired) {
    statusBadge = '🔴 <b>ផុតកំណត់ (Expired)</b>';
  }

  const expStr = formatDate(lic.expires_at);
  const planStr = formatPlanName(lic.plan_type);

  let msg =
    `🔍 <b>លទ្ធផលត្រួតពិនិត្យ LICENSE KEY</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔑 <b>License Key:</b>\n<code>${escapeHtml(lic.license_key || 'N/A')}</code>\n\n` +
    `🖥️ <b>Machine ID:</b>\n<code>${escapeHtml(lic.machine_id || 'N/A')}</code>\n\n` +
    `👤 <b>អតិថិជន:</b> <b>${escapeHtml(lic.customer_name || 'VIP User')}</b>\n` +
    `⏳ <b>គម្រោង:</b> ${planStr}\n` +
    `📊 <b>ស្ថានភាព:</b> ${statusBadge}\n` +
    `📅 <b>ផុតកំណត់នៅ:</b> ${expStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n`;

  // Inline action buttons
  const inlineButtons = [];
  if (!isRevoked && lic.license_key) {
    inlineButtons.push([
      {
        text: '🚫 ផ្អាក Key នេះ (Revoke)',
        callback_data: `rq:${lic.license_key}`,
      },
    ]);
  } else if (isRevoked && (lic.license_key || lic.machine_id)) {
    inlineButtons.push([
      {
        text: '🟢 បើកដំណើរការឡើងវិញ (Restore)',
        callback_data: `rst_do:${lic.license_key || lic.machine_id}`,
      },
    ]);
  }

  if (inlineButtons.length) {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: msg,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `👇 <b>ជ្រើសរើសសកម្មភាពបន្ថែមសម្រាប់ Key នេះ៖</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineButtons },
    });
  } else {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: msg,
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
  }
}

// Helper: Prompt Confirmation before Revoking
async function promptRevokeConfirmation(chatId, query) {
  const cleanQ = query.trim();
  await tgRequest('sendMessage', {
    chat_id: chatId,
    text: `🎯 <b>គោលដៅផ្អាក:</b> <code>${escapeHtml(cleanQ)}</code>`,
    parse_mode: 'HTML',
    reply_markup: MAIN_KEYBOARD,
  });
  await tgRequest('sendMessage', {
    chat_id: chatId,
    text:
      `⚠️ <b>បញ្ជាក់ការផ្អាក LICENSE (REVOKE)</b>\n\n` +
      `លោកអ្នកពិតជាចង់ផ្អាក License ខាងលើនេះមែនឬ?\n\n` +
      `<i>(ពេលផ្អាកហើយ កម្មវិធី JAI DUBBER លើម៉ាស៊ីននោះនឹងត្រូវចាក់សោរបិទភ្លាមៗ)</i>`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚠️ បញ្ជាក់ផ្អាក (Confirm Revoke)', callback_data: `rv_do:${cleanQ}` },
          { text: '❌ បោះបង់ (Cancel)', callback_data: 'cancel' },
        ],
      ],
    },
  });
}

// Handle All Callback Queries (Inline Buttons)
async function handleCallbackQuery(cb) {
  const cbId = cb.id;
  const fromId = String(cb.from?.id);
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const data = cb.data || '';

  if (!isAdmin(fromId)) {
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '⛔ អ្នកគ្មានសិទ្ធិប្រើប្រាស់ Bot នេះទេ!',
      show_alert: true,
    });
    return;
  }

  // Cancel Action
  if (data === 'cancel') {
    delete userStates[fromId];
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: 'បានបោះបង់!',
    });
    await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ <b>បានបោះបង់ប្រតិបត្តិការ។</b>\n\n👇 សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖',
      parse_mode: 'HTML',
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  // Prompt Revoke from Check button: rq:<key>
  if (data.startsWith('rq:')) {
    const key = data.replace('rq:', '');
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: 'សូមបញ្ជាក់...',
    });
    await promptRevokeConfirmation(chatId, key);
    return;
  }

  // Confirm Revoke Execution: rv_do:<key>
  if (data.startsWith('rv_do:')) {
    const key = data.replace('rv_do:', '');
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '⏳ កំពុងផ្អាក License...',
    });

    const res = await revokeLicense(key);
    await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});
    if (res && res.success) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text:
          `✅ <b>បានផ្អាក (REVOKE) LICENSE ជោគជ័យ!</b>\n\n` +
          `🔑 <b>Key:</b> <code>${escapeHtml(res.license_key || key)}</code>\n` +
          `🖥️ <b>Machine:</b> <code>${escapeHtml(res.machine_id || 'N/A')}</code>\n` +
          `👤 <b>អតិថិជន:</b> <b>${escapeHtml(res.customer_name || 'អតិថិជន')}</b>\n` +
          `🚫 <b>ស្ថានភាព:</b> <b>បានផ្អាកដំណើរការ (Suspended / Revoked)</b>\n\n` +
          `<i>កុំព្យូទ័រនេះនឹងលែងអាចប្រើប្រាស់កម្មវិធី JAI DUBBER បានទៀតហើយ។</i>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    } else {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចផ្អាក License បានទេ!')}`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    }
    return;
  }

  // Confirm Restore Execution: rst_do:<key>
  if (data.startsWith('rst_do:')) {
    const key = data.replace('rst_do:', '');
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '⏳ កំពុងបើកដំណើរការ License ឡើងវិញ...',
    });

    const res = await restoreLicense(key);
    await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});
    if (res && res.success) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text:
          `✅ <b>បានបើកដំណើរការ (RESTORE) LICENSE ឡើងវិញជោគជ័យ!</b>\n\n` +
          `🔑 <b>Key:</b> <code>${escapeHtml(res.license_key || key)}</code>\n` +
          `🖥️ <b>Machine:</b> <code>${escapeHtml(res.machine_id || 'N/A')}</code>\n` +
          `👤 <b>អតិថិជន:</b> <b>${escapeHtml(res.customer_name || 'អតិថិជន')}</b>\n` +
          `🟢 <b>ស្ថានភាព:</b> <b>សកម្មឡើងវិញ (Active)</b>\n\n` +
          `<i>កុំព្យូទ័រនេះអាចបើកប្រើប្រាស់កម្មវិធី JAI DUBBER បានជាធម្មតាឡើងវិញហើយ។</i>`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    } else {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចបើកដំណើរការ License ឡើងវិញបានទេ!')}`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    }
    return;
  }

  // Plan Selection for Generation: "g:<plan>:<machineId>"
  if (data.startsWith('g:')) {
    const [, plan, machineId] = data.split(':');
    if (!plan || !machineId) {
      await tgRequest('answerCallbackQuery', {
        callback_query_id: cbId,
        text: '⚠️ ទិន្នន័យមិនត្រឹមត្រូវ!',
      });
      return;
    }

    const canonicalPlan = normalizePlanType(plan);
    const planLabel = formatPlanName(canonicalPlan);

    // Save state to wait for Customer Name
    userStates[fromId] = {
      action: 'WAITING_CUSTOMER_NAME',
      machineId: machineId,
      plan: canonicalPlan,
    };

    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: `បានជ្រើសរើស៖ ${planLabel}`,
    });

    await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text:
        `👤 <b>បញ្ចូលឈ្មោះអតិថិជន (CUSTOMER NAME)</b>\n\n` +
        `⏳ <b>គម្រោង៖</b> ${planLabel}\n` +
        `🖥️ <b>Machine ID៖</b> <code>${escapeHtml(machineId)}</code>\n\n` +
        `👉 <b>សូមវាយឈ្មោះអតិថិជនផ្ញើចូលមកទីនេះ៖</b>\n` +
        `<i>(ឧទាហរណ៍៖ សុខា ឬ Kim San ឬ ឈ្មោះហាង)</i>\n\n` +
        `<i>💡 ឬចុចប៊ូតុងខាងក្រោម ប្រសិនបើមិនចង់ដាក់ឈ្មោះ៖</i>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏭️ មិនបាច់ដាក់ឈ្មោះ (រំលង / Skip)', callback_data: `skp:${canonicalPlan}:${machineId}` },
          ],
          [
            { text: '❌ បោះបង់ (Cancel)', callback_data: 'cancel' },
          ],
        ],
      },
    });
    return;
  }

  // Skip Customer Name: "skp:<plan>:<machineId>"
  if (data.startsWith('skp:')) {
    const [, plan, machineId] = data.split(':');
    delete userStates[fromId];

    await tgRequest('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '⏳ កំពុងបង្កើត License Key...',
    });

    await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});

    try {
      const res = await generateLicense(machineId, plan, 'អតិថិជន');
      if (res && res.success) {
        await tgRequest('sendMessage', {
          chat_id: chatId,
          text: buildSuccessMessageHtml(res),
          parse_mode: 'HTML',
          reply_markup: MAIN_KEYBOARD,
        });
      } else {
        await tgRequest('sendMessage', {
          chat_id: chatId,
          text: `❌ <b>កំហុស៖</b> ${escapeHtml(res?.message || 'មិនអាចបង្កើត License បានទេ!')}`,
          parse_mode: 'HTML',
          reply_markup: MAIN_KEYBOARD,
        });
      }
    } catch (err) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `❌ <b>កំហុស Server:</b> ${escapeHtml(err.message)}`,
        parse_mode: 'HTML',
        reply_markup: MAIN_KEYBOARD,
      });
    }
    return;
  }
}

// Remove Bot Commands so Telegram displays only the 5 custom reply Buttons
async function removeMenuCommands() {
  await tgRequest('deleteMyCommands');
  console.log('[Bot] Successfully deleted Telegram menu commands (enforcing Buttons UI).');
}

// Long Polling Loop
let lastUpdateId = 0;

async function pollUpdates() {
  console.log(`[Bot] JAI Dubber License Bot is running...`);
  console.log(`[Bot] Authorized Admin IDs: ${ADMIN_USER_IDS.join(', ')}`);

  await removeMenuCommands();

  while (true) {
    try {
      const data = await tgRequest('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 25,
      });

      if (data && data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;

          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.error('[Bot Error] Polling error:', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

pollUpdates();
