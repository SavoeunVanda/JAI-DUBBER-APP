#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JAI DUBBER - TELEGRAM LICENSE MANAGER BOT (Python Daemon for Render.com / 24/7 Cloud)
====================================================================================
Supported Admins: 5539122351, 7830506724
Bot Token: 8621465790:AAFXsZMtVwiN9ALv6kjU-T1xBo8_R-29bmg
Supabase: https://nmpjteqgvhndrqcoxwrs.supabase.co
"""

import os
import sys
import time
import json
import re
import requests
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# --- CONFIGURATIONS ---
BOT_TOKEN = "8621465790:AAFXsZMtVwiN9ALv6kjU-T1xBo8_R-29bmg"
ADMIN_USER_IDS = [5539122351, 7830506724]

SUPABASE_URL = "https://nmpjteqgvhndrqcoxwrs.supabase.co"
SUPABASE_KEY = "sb_publishable_90-Kedr2pSBoTHignMlQdw_uv03Fpl2"
ADMIN_SECRET = "JAI_ADMIN_SECRET_2026"

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# Built-in lightweight HTTP server for Render.com Free Web Service Health Checks
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"JAI Dubber Telegram License Bot is Running 24/7 OK!")

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        return

def _run_health_server():
    port_env = os.environ.get("PORT", "10000")
    try:
        port = int(port_env)
    except Exception:
        port = 10000
    try:
        server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
        print(f"[+] Health server successfully listening on 0.0.0.0:{port} for Render.com", flush=True)
        server.serve_forever()
    except Exception as e:
        print(f"[!] Health server binding error on port {port}: {e}", flush=True)

# Launch HTTP server in background thread so Render port binding succeeds immediately
_health_thread = threading.Thread(target=_run_health_server, daemon=True)
_health_thread.start()

user_states = {}

def is_admin(user_id) -> bool:
    try:
        return int(user_id) in ADMIN_USER_IDS
    except Exception:
        return False

# --- SUPABASE RPC CALLS ---

def call_supabase_rpc(func_name: str, payload: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/rpc/{func_name}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=12)
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 404:
            return {
                "success": False,
                "message": f"រកមិនឃើញ Function '{func_name}' ក្នុង Supabase ទេ។ សូម Run កូដ scripts/supabase_admin_functions.sql ក្នុង SQL Editor ជាមុនសិន!",
            }
        else:
            return {
                "success": False,
                "message": f"Supabase Error ({resp.status_code}): {resp.text}",
            }
    except Exception as e:
        return {"success": False, "message": f"Connection Error: {str(e)}"}

def normalize_plan_type(raw_plan: str) -> str:
    if not raw_plan:
        return "1month"
    p = str(raw_plan).strip().lower().replace(" ", "").replace("_", "").replace("-", "")

    # Lifetime
    if p in ("lifetime", "life", "forever", "perm", "permanent", "ទិញដាច់", "ដាច់", "ពេញមួយជីវិត"):
        return "lifetime"

    # 1 Year / 12 Months
    if p in ("1year", "1years", "1y", "yearly", "year", "12m", "12month", "12months", "1ឆ្នាំ", "១ឆ្នាំ", "12ខែ", "១២ខែ"):
        return "1year"

    # 6 Months
    if p in ("6month", "6months", "6m", "6", "៦", "6ខែ", "៦ខែ", "halfyear", "half-year"):
        return "6month"

    # 3 Months
    if p in ("3month", "3months", "3m", "3", "៣", "3ខែ", "៣ខែ", "quarter"):
        return "3month"

    # 1 Month
    if p in ("1month", "1months", "1m", "1", "១", "monthly", "month", "1ខែ", "១ខែ", "30d", "30days", "30ថ្ងៃ", "៣០ថ្ងៃ"):
        return "1month"

    # 1 Week
    if p in ("1week", "1weeks", "1w", "weekly", "week", "7d", "7days", "1សប្តាហ៍", "១សប្តាហ៍", "7ថ្ងៃ", "៧ថ្ងៃ"):
        return "1week"

    # 1 Day / Trial
    if p in ("1day", "1days", "1d", "day", "daily", "trial", "1ថ្ងៃ", "១ថ្ងៃ", "សាកល្បង"):
        return "1day"

    if re.search(r"^(3|៣)(m|month|ខែ)", p):
        return "3month"
    if re.search(r"^(6|៦)(m|month|ខែ)", p):
        return "6month"
    if re.search(r"^(1|១)(y|year|ឆ្នាំ)", p):
        return "1year"
    if re.search(r"^(1|១)(w|week|សប្តាហ៍)", p):
        return "1week"
    if re.search(r"^(1|១)(d|day|ថ្ងៃ)", p):
        return "1day"
    if re.search(r"^(1|១)(m|month|ខែ)", p):
        return "1month"

    return "1month"

def db_generate_license(machine_id: str, plan_type: str = "1month", customer_name: str = "VIP Customer") -> dict:
    canonical_plan = normalize_plan_type(plan_type)
    return call_supabase_rpc("admin_generate_license", {
        "p_admin_secret": ADMIN_SECRET,
        "p_machine_id": machine_id.strip(),
        "p_plan_type": canonical_plan,
        "p_customer_name": customer_name.strip() or "VIP Customer",
    })

def db_check_license(query: str) -> dict:
    return call_supabase_rpc("admin_check_license", {
        "p_admin_secret": ADMIN_SECRET,
        "p_query": query.strip(),
    })

def db_revoke_license(query: str) -> dict:
    return call_supabase_rpc("admin_revoke_license", {
        "p_admin_secret": ADMIN_SECRET,
        "p_query": query.strip(),
    })

def db_restore_license(query: str) -> dict:
    return call_supabase_rpc("admin_restore_license", {
        "p_admin_secret": ADMIN_SECRET,
        "p_query": query.strip(),
    })

def db_list_licenses(limit: int = 10) -> dict:
    return call_supabase_rpc("admin_list_licenses", {
        "p_admin_secret": ADMIN_SECRET,
        "p_limit": limit,
    })

# --- TELEGRAM HELPER FUNCTIONS ---

def tg_send(chat_id: int, text: str, reply_markup: dict = None, parse_mode: str = "HTML") -> bool:
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        r = requests.post(f"{TELEGRAM_API}/sendMessage", json=payload, timeout=10)
        return r.status_code == 200
    except Exception as e:
        print(f"[Error tg_send] {e}", flush=True)
        return False

def tg_answer_callback(callback_id: str, text: str = None, show_alert: bool = False) -> bool:
    payload = {"callback_query_id": callback_id, "show_alert": show_alert}
    if text:
        payload["text"] = text
    try:
        requests.post(f"{TELEGRAM_API}/answerCallbackQuery", json=payload, timeout=5)
        return True
    except Exception:
        return False

def tg_delete_message(chat_id: int, message_id: int):
    try:
        requests.post(f"{TELEGRAM_API}/deleteMessage", json={"chat_id": chat_id, "message_id": message_id}, timeout=5)
    except Exception:
        pass

def format_plan_name(plan: str) -> str:
    if not plan:
        return "មិនបានបញ្ជាក់"
    canonical = normalize_plan_type(plan)
    if canonical == "1day":
        return "⚡ Trial (១ ថ្ងៃ)"
    if canonical == "1week":
        return "📅 1 Week (១ សប្តាហ៍)"
    if canonical == "1month":
        return "⏳ 1 Month (១ ខែ / ៣០ ថ្ងៃ)"
    if canonical == "3month":
        return "🥉 3 Months (៣ ខែ / ៩០ ថ្ងៃ)"
    if canonical == "6month":
        return "🥈 6 Months (៦ ខែ / ១៨០ ថ្ងៃ)"
    if canonical == "1year":
        return "🥇 1 Year (១ ឆ្នាំ / ៣៦៥ ថ្ងៃ)"
    if canonical == "lifetime":
        return "🌟 Lifetime (ទិញដាច់ គ្មានថ្ងៃផុតកំណត់)"
    return plan

def format_date(dt_str: str) -> str:
    if not dt_str:
        return "♾️ គ្មានថ្ងៃផុតកំណត់ (Lifetime)"
    try:
        clean = dt_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return dt_str[:16].replace("T", " ")

def escape_html(text: str) -> str:
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def build_success_invoice(data: dict) -> str:
    key = data.get("license_key", "")
    hwid = data.get("machine_id", "")
    customer = data.get("customer_name", "អតិថិជន")
    plan = format_plan_name(data.get("plan_type", "1month"))
    exp = format_date(data.get("expires_at"))

    return (
        f"🎉 <b>បង្កើត LICENSE KEY ជោគជ័យ!</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🔑 <b>License Key:</b>\n<code>{escape_html(key)}</code>\n\n"
        f"👤 <b>អតិថិជន:</b> <b>{escape_html(customer)}</b>\n"
        f"🖥️ <b>Machine ID:</b> <code>{escape_html(hwid)}</code>\n"
        f"⏳ <b>គម្រោង:</b> <b>{escape_html(plan)}</b>\n"
        f"📅 <b>ផុតកំណត់:</b> <code>{escape_html(exp)}</code>\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👉 <b>របៀបប្រើប្រាស់៖</b>\n"
        f"1. បើកកម្មវិធី <b>JAI DUBBER</b>\n"
        f"2. ចុចប៊ូតុង <b>🔑 LICENSE</b>\n"
        f"3. Copy License Key ខាងលើ Paste ចូល រួចចុច <b>យល់ព្រម (ACTIVATE)</b> ជាការស្រេច!"
    )

def get_main_keyboard() -> dict:
    return {
        "keyboard": [
            [{"text": "➕ បង្កើត License Key ថ្មី"}, {"text": "📋 បញ្ជី Key ថ្មីៗ"}],
            [{"text": "🔍 ពិនិត្យ License (Check)"}, {"text": "🚫 ផ្អាក License (Revoke)"}],
            [{"text": "ℹ️ ជំនួយ (Help)"}]
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }

def get_plan_inline_keyboard(machine_id: str) -> dict:
    mid = machine_id.strip()
    return {
        "inline_keyboard": [
            [
                {"text": "⚡ Trial 1 ថ្ងៃ (1day)", "callback_data": f"g:1day:{mid}"},
                {"text": "📅 1 សប្តាហ៍ (1week)", "callback_data": f"g:1week:{mid}"},
            ],
            [
                {"text": "⏳ 1 ខែ (1month)", "callback_data": f"g:1month:{mid}"},
                {"text": "🥉 3 ខែ (3month)", "callback_data": f"g:3month:{mid}"},
            ],
            [
                {"text": "🥈 6 ខែ (6month)", "callback_data": f"g:6month:{mid}"},
                {"text": "🥇 1 ឆ្នាំ (1year)", "callback_data": f"g:1year:{mid}"},
            ],
            [
                {"text": "🌟 Lifetime (ទិញដាច់)", "callback_data": f"g:lifetime:{mid}"},
            ],
            [
                {"text": "❌ បោះបង់ (Cancel)", "callback_data": "cancel"},
            ]
        ]
    }

# --- HANDLERS ---

def handle_start(chat_id: int):
    msg = (
        "👋 <b>សួស្តី Admin!</b> ស្វាគមន៍មកកាន់ប្រព័ន្ធគ្រប់គ្រង License នៃ <b>JAI DUBBER</b> 24/7 Cloud Bot។\n\n"
        "🛡️ Bot នេះភ្ជាប់ដោយស្វ័យប្រវត្តិជាមួយ <b>Supabase Cloud Database</b> ដើម្បីបង្កើត និងផ្អាកដំណើរការ License ពីចម្ងាយ។\n\n"
        "👇 <b>សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖</b>"
    )
    tg_send(chat_id, msg, reply_markup=get_main_keyboard())

def handle_help(chat_id: int):
    msg = (
        "ℹ️ <b>ជំនួយ និងការណែនាំបញ្ជា (HELP & COMMANDS)</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "1. <b>បង្កើត License Key ថ្មី៖</b>\n"
        "• ចុចប៊ូតុង <b>➕ បង្កើត License Key ថ្មី</b>\n"
        "• ឬគ្រាន់តែផ្ញើ Machine ID ចូលមក (Bot នឹងបង្ហាញជម្រើសគម្រោង)\n"
        "• ឬវាយបញ្ជាផ្ទាល់៖\n"
        "  <code>/gen &lt;machine_id&gt; [plan] [customer]</code>\n\n"
        "2. <b>ពិនិត្យមើល License (Check):</b>\n"
        "• ចុចប៊ូតុង <b>🔍 ពិនិត្យ License (Check)</b>\n"
        "• ឬវាយបញ្ជា៖ <code>/check &lt;key_or_machine_id&gt;</code>\n\n"
        "3. <b>ផ្អាកដំណើរការ License (Revoke):</b>\n"
        "• ចុចប៊ូតុង <b>🚫 ផ្អាក License (Revoke)</b>\n"
        "• ឬវាយបញ្ជា៖ <code>/revoke &lt;key_or_machine_id&gt;</code>\n\n"
        "4. <b>បើកដំណើរការឡើងវិញ (Restore):</b>\n"
        "• វាយបញ្ជា៖ <code>/restore &lt;key_or_machine_id&gt;</code>\n\n"
        "5. <b>បញ្ជី License ថ្មីៗ៖</b>\n"
        "• ចុចប៊ូតុង <b>📋 បញ្ជី Key ថ្មីៗ</b> ឬវាយ <code>/list</code>\n"
        "━━━━━━━━━━━━━━━━━━━━"
    )
    tg_send(chat_id, msg, reply_markup=get_main_keyboard())

def handle_list(chat_id: int):
    res = db_list_licenses(8)
    data = res.get("data", []) if res.get("success") else []
    if not data:
        tg_send(chat_id, "📋 <b>បញ្ជី LICENSE KEYS ថ្មីៗ</b>\n\nℹ️ មិនទាន់មានទិន្នន័យ License ក្នុងប្រព័ន្ធនៅឡើយទេ។", reply_markup=get_main_keyboard())
        return

    msg = f"📋 <b>បញ្ជី LICENSE KEYS ថ្មីៗ ({len(data)})៖</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"
    for i, item in enumerate(data, 1):
        plan_str = format_plan_name(item.get("plan_type"))
        exp_str = format_date(item.get("expires_at"))
        is_revoked = item.get("is_active") is False
        status_badge = "🚫 <b>បានផ្អាក (Revoked)</b>" if is_revoked else "🟢 <b>សកម្ម (Active)</b>"

        msg += (
            f"<b>{i}.</b> 🔑 <code>{escape_html(item.get('license_key'))}</code>\n"
            f"👤 <b>{escape_html(item.get('customer_name', 'អតិថិជន'))}</b> | ⏳ {escape_html(plan_str)}\n"
            f"🖥️ <code>{escape_html(item.get('machine_id', 'N/A'))}</code>\n"
            f"📊 ស្ថានភាព: {status_badge}\n"
            f"📅 ផុតកំណត់: <code>{escape_html(exp_str)}</code>\n\n"
        )
    msg += "━━━━━━━━━━━━━━━━━━━━\n💡 <i>ចុចលើ License Key ដើម្បី Copy</i>"
    tg_send(chat_id, msg, reply_markup=get_main_keyboard())

def process_check(chat_id: int, query: str):
    q = query.strip()
    res = db_check_license(q)
    if not res.get("success") or not res.get("data"):
        tg_send(
            chat_id,
            f"❌ <b>រកមិនឃើញ LICENSE!</b>\n\nពាក្យស្វែងរក: <code>{escape_html(q)}</code>\n\n<i>{escape_html(res.get('message', 'សូមពិនិត្យមើល Key ឬ Machine ID ម្តងទៀត'))}</i>",
            reply_markup=get_main_keyboard()
        )
        return

    lic = res["data"]
    is_revoked = lic.get("is_active") is False
    is_expired = lic.get("is_expired") is True

    if is_revoked:
        badge = "🚫 <b>បានផ្អាក (Revoked / Inactive)</b>"
    elif is_expired:
        badge = "🔴 <b>ផុតកំណត់ (Expired)</b>"
    else:
        badge = "🟢 <b>សកម្ម (Active)</b>"

    msg = (
        f"🔍 <b>លទ្ធផលត្រួតពិនិត្យ LICENSE KEY</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🔑 <b>License Key:</b>\n<code>{escape_html(lic.get('license_key', 'N/A'))}</code>\n\n"
        f"🖥️ <b>Machine ID:</b>\n<code>{escape_html(lic.get('machine_id', 'N/A'))}</code>\n\n"
        f"👤 <b>អតិថិជន:</b> <b>{escape_html(lic.get('customer_name', 'អតិថិជន'))}</b>\n"
        f"⏳ <b>គម្រោង:</b> {format_plan_name(lic.get('plan_type'))}\n"
        f"📊 <b>ស្ថានភាព:</b> {badge}\n"
        f"📅 <b>ផុតកំណត់នៅ:</b> {format_date(lic.get('expires_at'))}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
    )

    inline_buttons = []
    key = lic.get("license_key")
    if not is_revoked and key:
        inline_buttons.append([{"text": "🚫 ផ្អាក Key នេះ (Revoke)", "callback_data": f"rq:{key}"}])
    elif is_revoked and key:
        inline_buttons.append([{"text": "🟢 បើកដំណើរការឡើងវិញ (Restore)", "callback_data": f"rst_do:{key}"}])

    if inline_buttons:
        tg_send(chat_id, msg, reply_markup=get_main_keyboard())
        tg_send(chat_id, "👇 <b>ជ្រើសរើសសកម្មភាពបន្ថែមសម្រាប់ Key នេះ៖</b>", reply_markup={"inline_keyboard": inline_buttons})
    else:
        tg_send(chat_id, msg, reply_markup=get_main_keyboard())

def prompt_revoke(chat_id: int, query: str):
    clean_q = query.strip()
    tg_send(chat_id, f"🎯 <b>គោលដៅផ្អាក:</b> <code>{escape_html(clean_q)}</code>", reply_markup=get_main_keyboard())
    tg_send(
        chat_id,
        f"⚠️ <b>បញ្ជាក់ការផ្អាក LICENSE (REVOKE)</b>\n\n"
        f"លោកអ្នកពិតជាចង់ផ្អាក License ខាងលើនេះមែនឬ?\n\n"
        f"<i>(ពេលផ្អាកហើយ កម្មវិធី JAI DUBBER លើម៉ាស៊ីននោះនឹងត្រូវចាក់សោរបិទភ្លាមៗ)</i>",
        reply_markup={
            "inline_keyboard": [
                [
                    {"text": "⚠️ បញ្ជាក់ផ្អាក (Confirm Revoke)", "callback_data": f"rv_do:{clean_q}"},
                    {"text": "❌ បោះបង់ (Cancel)", "callback_data": "cancel"},
                ]
            ]
        }
    )

# --- PROCESS INCOMING UPDATES ---

def process_message(msg: dict):
    user_id = msg.get("from", {}).get("id")
    chat_id = msg.get("chat", {}).get("id")
    text = (msg.get("text") or "").strip()

    if not is_admin(user_id):
        tg_send(chat_id, "⛔ <b>សុំទោស!</b> អ្នកមិនមានសិទ្ធិប្រើប្រាស់ Bot នេះឡើយ។")
        return

    # Cancel command
    if text in ("/cancel", "❌ បោះបង់"):
        user_states.pop(user_id, None)
        tg_send(chat_id, "❌ <b>បានបោះបង់ប្រតិបត្តិការ។</b>\n\n👇 សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖", reply_markup=get_main_keyboard())
        return

    # Start / Help
    if text in ("/start", "/menu"):
        user_states.pop(user_id, None)
        handle_start(chat_id)
        return

    if text in ("ℹ️ ជំនួយ (Help)", "/help"):
        user_states.pop(user_id, None)
        handle_help(chat_id)
        return

    # Button: ➕ បង្កើត License Key ថ្មី
    if text in ("➕ បង្កើត License Key ថ្មី", "🔑 បង្កើត License Key", "⚡ Generate Key"):
        user_states[user_id] = "WAITING_MACHINE_ID"
        tg_send(
            chat_id,
            "➕ <b>បង្កើត LICENSE KEY ថ្មី</b>\n\n"
            "📥 <b>សូមផ្ញើ Machine ID របស់ភ្ញៀវចូលមកទីនេះ៖</b>\n\n"
            "<i>ឧទាហរណ៍៖</i> <code>767012c8-6cb7-4360-b56d-5ffde610e913</code>\n\n"
            "<i>(💡 ភ្ញៀវអាច Copy Machine ID ពីក្នុងផ្ទាំង Activation Lock នៃកម្មវិធី JAI DUBBER ផ្ញើមកលោកអ្នក)</i>",
            reply_markup=get_main_keyboard()
        )
        return

    # Button: 📋 បញ្ជី Key ថ្មីៗ
    if text in ("📋 បញ្ជី Key ថ្មីៗ", "/list"):
        user_states.pop(user_id, None)
        handle_list(chat_id)
        return

    # Button: 🔍 ពិនិត្យ License (Check)
    if text == "🔍 ពិនិត្យ License (Check)":
        user_states[user_id] = "WAITING_CHECK_KEY"
        tg_send(
            chat_id,
            "🔍 <b>ពិនិត្យមើល LICENSE KEY (CHECK)</b>\n\n"
            "សូមផ្ញើ <b>License Key</b> ឬ <b>Machine ID</b> ដែលលោកអ្នកចង់ត្រួតពិនិត្យចូលមកទីនេះ៖\n\n"
            "<i>ឧទាហរណ៍៖</i>\n"
            "• Key: <code>JAIDUB-60E5-05A9-B5E4</code>\n"
            "• Machine ID: <code>767012c8-6cb7-4360-b56d-5ffde610e913</code>",
            reply_markup=get_main_keyboard()
        )
        return

    # Button: 🚫 ផ្អាក License (Revoke)
    if text == "🚫 ផ្អាក License (Revoke)":
        user_states[user_id] = "WAITING_REVOKE_KEY"
        tg_send(
            chat_id,
            "🚫 <b>ផ្អាកដំណើរការ LICENSE KEY (REVOKE)</b>\n\n"
            "សូមផ្ញើ <b>License Key</b> ឬ <b>Machine ID</b> ដែលលោកអ្នកចង់ផ្អាក (Revoke)៖\n\n"
            "<i>⚠️ ការផ្អាកនេះនឹងបិទដំណើរការកម្មវិធី JAI DUBBER លើម៉ាស៊ីននោះភ្លាមៗ!</i>",
            reply_markup=get_main_keyboard()
        )
        return

    # Commands: /check, /revoke, /restore, /gen
    if text.startswith("/check"):
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            user_states[user_id] = "WAITING_CHECK_KEY"
            tg_send(chat_id, "🔍 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់ពិនិត្យ៖</b>", reply_markup=get_main_keyboard())
            return
        process_check(chat_id, parts[1])
        return

    if text.startswith("/revoke"):
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            user_states[user_id] = "WAITING_REVOKE_KEY"
            tg_send(chat_id, "🚫 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់ផ្អាក៖</b>", reply_markup=get_main_keyboard())
            return
        prompt_revoke(chat_id, parts[1])
        return

    if text.startswith("/restore"):
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            tg_send(chat_id, "🟢 <b>សូមផ្ញើ License Key ឬ Machine ID ដែលចង់បើកដំណើរការឡើងវិញ៖</b>", reply_markup=get_main_keyboard())
            return
        target = parts[1].strip()
        res = db_restore_license(target)
        if res.get("success"):
            tg_send(
                chat_id,
                f"✅ <b>បានបើកដំណើរការ (RESTORE) LICENSE ឡើងវិញជោគជ័យ!</b>\n\n"
                f"🔑 <b>Key:</b> <code>{escape_html(res.get('license_key', target))}</code>\n"
                f"🖥️ <b>Machine:</b> <code>{escape_html(res.get('machine_id', 'N/A'))}</code>\n"
                f"👤 <b>អតិថិជន:</b> <b>{escape_html(res.get('customer_name', 'អតិថិជន'))}</b>\n"
                f"🟢 <b>ស្ថានភាព:</b> <b>សកម្មឡើងវិញ (Active)</b>\n\n"
                f"<i>កុំព្យូទ័រនេះអាចបើកប្រើប្រាស់កម្មវិធី JAI DUBBER បានជាធម្មតាឡើងវិញហើយ។</i>",
                reply_markup=get_main_keyboard()
            )
        else:
            tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចបើកដំណើរការឡើងវិញបានទេ!'))}", reply_markup=get_main_keyboard())
        return

    if text.startswith("/gen"):
        parts = text.split(maxsplit=3)
        if len(parts) < 2:
            tg_send(chat_id, "⚠️ <b>សូមបញ្ជាក់ Machine ID!</b>\n\nទម្រង់៖ <code>/gen &lt;machine_id&gt; &lt;plan&gt; [ឈ្មោះ]</code>", reply_markup=get_main_keyboard())
            return
        mid = parts[1].strip()
        plan = parts[2].strip() if len(parts) >= 3 else "1month"
        cust = parts[3].strip() if len(parts) >= 4 else "VIP Customer"
        res = db_generate_license(mid, plan, cust)
        if res.get("success"):
            tg_send(chat_id, build_success_invoice(res), reply_markup=get_main_keyboard())
        else:
            tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចបង្កើត License បានទេ'))}", reply_markup=get_main_keyboard())
        return

    # Check state
    state = user_states.get(user_id)
    if isinstance(state, dict) and state.get("action") == "WAITING_CUSTOMER_NAME":
        user_states.pop(user_id, None)
        mid = state.get("machine_id")
        plan = state.get("plan", "1month")
        cust = text.strip() or "អតិថិជន"
        if mid:
            res = db_generate_license(mid, plan, cust)
            if res.get("success"):
                tg_send(chat_id, build_success_invoice(res), reply_markup=get_main_keyboard())
            else:
                tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចបង្កើត License បានទេ'))}", reply_markup=get_main_keyboard())
            return

    if state == "WAITING_CHECK_KEY":
        user_states.pop(user_id, None)
        process_check(chat_id, text)
        return

    if state == "WAITING_REVOKE_KEY":
        user_states.pop(user_id, None)
        prompt_revoke(chat_id, text)
        return

    # Direct key lookup
    if text.upper().startswith("JAIDUB-"):
        user_states.pop(user_id, None)
        process_check(chat_id, text)
        return

    # Direct Machine ID (UUID) detection
    uuid_match = re.search(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", text, re.I)
    if uuid_match:
        mid = uuid_match.group(0)
        user_states.pop(user_id, None)
        tg_send(chat_id, f"🖥️ <b>បានទទួល Machine ID:</b>\n<code>{escape_html(mid)}</code>", reply_markup=get_main_keyboard())
        tg_send(chat_id, "👇 <b>សូមចុចលើ Button ខាងក្រោមដើម្បីជ្រើសរើសគម្រោង៖</b>", reply_markup=get_plan_inline_keyboard(mid))
        return

    if state == "WAITING_MACHINE_ID" and re.match(r"^[a-z0-9\-]{16,64}$", text, re.I):
        user_states.pop(user_id, None)
        tg_send(chat_id, f"🖥️ <b>បានទទួល Machine ID:</b>\n<code>{escape_html(text)}</code>", reply_markup=get_main_keyboard())
        tg_send(chat_id, "👇 <b>សូមចុចលើ Button ខាងក្រោមដើម្បីជ្រើសរើសគម្រោង៖</b>", reply_markup=get_plan_inline_keyboard(text))
        return

    # Default fallback
    tg_send(
        chat_id,
        "ℹ️ <b>សូមជ្រើសរើសមុខងារពី Button ខាងក្រោម៖</b>\n\n"
        "• <b>➕ បង្កើត License Key ថ្មី</b> - បង្កើត Key ចងភ្ជាប់ Machine ID\n"
        "• <b>📋 បញ្ជី Key ថ្មីៗ</b> - មើលបញ្ជី License ទាំងអស់\n"
        "• <b>🔍 ពិនិត្យ License (Check)</b> - ពិនិត្យសុពលភាព Key\n"
        "• <b>🚫 ផ្អាក License (Revoke)</b> - ផ្អាក / បិទ Key\n"
        "• <b>ℹ️ ជំនួយ (Help)</b> - ការណែនាំលម្អិត",
        reply_markup=get_main_keyboard()
    )

def process_callback(cb: dict):
    user_id = cb.get("from", {}).get("id")
    chat_id = cb.get("message", {}).get("chat", {}).get("id")
    message_id = cb.get("message", {}).get("message_id")
    data = cb.get("data", "")
    cb_id = cb.get("id")

    if not is_admin(user_id):
        tg_answer_callback(cb_id, "⛔ អ្នកគ្មានសិទ្ធិប្រើប្រាស់ Bot នេះទេ!", show_alert=True)
        return

    if data == "cancel":
        user_states.pop(user_id, None)
        tg_answer_callback(cb_id, "បានបោះបង់!")
        tg_delete_message(chat_id, message_id)
        tg_send(chat_id, "❌ <b>បានបោះបង់ប្រតិបត្តិការ។</b>", reply_markup=get_main_keyboard())
        return

    if data.startswith("rq:"):
        key = data.replace("rq:", "")
        tg_answer_callback(cb_id, "សូមបញ្ជាក់...")
        prompt_revoke(chat_id, key)
        return

    if data.startswith("rv_do:"):
        key = data.replace("rv_do:", "")
        tg_answer_callback(cb_id, "⏳ កំពុងផ្អាក License...")
        res = db_revoke_license(key)
        tg_delete_message(chat_id, message_id)
        if res.get("success"):
            tg_send(
                chat_id,
                f"✅ <b>បានផ្អាក (REVOKE) LICENSE ជោគជ័យ!</b>\n\n"
                f"🔑 <b>Key:</b> <code>{escape_html(res.get('license_key', key))}</code>\n"
                f"🖥️ <b>Machine:</b> <code>{escape_html(res.get('machine_id', 'N/A'))}</code>\n"
                f"👤 <b>អតិថិជន:</b> <b>{escape_html(res.get('customer_name', 'អតិថិជន'))}</b>\n"
                f"🚫 <b>ស្ថានភាព:</b> <b>បានផ្អាកដំណើរការ (Suspended / Revoked)</b>\n\n"
                f"<i>កុំព្យូទ័រនេះនឹងលែងអាចប្រើប្រាស់កម្មវិធី JAI DUBBER បានទៀតហើយ។</i>",
                reply_markup=get_main_keyboard()
            )
        else:
            tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចផ្អាក License បានទេ!'))}", reply_markup=get_main_keyboard())
        return

    if data.startswith("rst_do:"):
        key = data.replace("rst_do:", "")
        tg_answer_callback(cb_id, "⏳ កំពុងបើកដំណើរការឡើងវិញ...")
        res = db_restore_license(key)
        tg_delete_message(chat_id, message_id)
        if res.get("success"):
            tg_send(
                chat_id,
                f"✅ <b>បានបើកដំណើរការ (RESTORE) LICENSE ឡើងវិញជោគជ័យ!</b>\n\n"
                f"🔑 <b>Key:</b> <code>{escape_html(res.get('license_key', key))}</code>\n"
                f"🖥️ <b>Machine:</b> <code>{escape_html(res.get('machine_id', 'N/A'))}</code>\n"
                f"👤 <b>អតិថិជន:</b> <b>{escape_html(res.get('customer_name', 'អតិថិជន'))}</b>\n"
                f"🟢 <b>ស្ថានភាព:</b> <b>សកម្មឡើងវិញ (Active)</b>\n\n"
                f"<i>កុំព្យូទ័រនេះអាចបើកប្រើប្រាស់កម្មវិធី JAI DUBBER បានជាធម្មតាឡើងវិញហើយ។</i>",
                reply_markup=get_main_keyboard()
            )
        else:
            tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចបើកដំណើរការឡើងវិញបានទេ!'))}", reply_markup=get_main_keyboard())
        return

    if data.startswith("g:"):
        _, plan, mid = data.split(":")
        canonical_plan = normalize_plan_type(plan)
        plan_label = format_plan_name(canonical_plan)

        user_states[user_id] = {
            "action": "WAITING_CUSTOMER_NAME",
            "machine_id": mid,
            "plan": canonical_plan,
        }

        tg_answer_callback(cb_id, f"បានជ្រើសរើស៖ {plan_label}")
        tg_delete_message(chat_id, message_id)

        msg = (
            f"👤 <b>បញ្ចូលឈ្មោះអតិថិជន (CUSTOMER NAME)</b>\n\n"
            f"⏳ <b>គម្រោង៖</b> {plan_label}\n"
            f"🖥️ <b>Machine ID៖</b> <code>{escape_html(mid)}</code>\n\n"
            f"👉 <b>សូមវាយឈ្មោះអតិថិជនផ្ញើចូលមកទីនេះ៖</b>\n"
            f"<i>(ឧទាហរណ៍៖ សុខា ឬ Kim San ឬ ឈ្មោះហាង)</i>\n\n"
            f"<i>💡 ឬចុចប៊ូតុងខាងក្រោម ប្រសិនបើមិនចង់ដាក់ឈ្មោះ៖</i>"
        )
        reply_markup = {
            "inline_keyboard": [
                [{"text": "⏭️ មិនបាច់ដាក់ឈ្មោះ (រំលង / Skip)", "callback_data": f"skp:{canonical_plan}:{mid}"}],
                [{"text": "❌ បោះបង់ (Cancel)", "callback_data": "cancel"}]
            ]
        }
        tg_send(chat_id, msg, reply_markup=reply_markup)
        return

    if data.startswith("skp:"):
        _, plan, mid = data.split(":")
        user_states.pop(user_id, None)
        tg_answer_callback(cb_id, "⏳ កំពុងបង្កើត License Key...")
        tg_delete_message(chat_id, message_id)
        res = db_generate_license(mid, plan, "អតិថិជន")
        if res.get("success"):
            tg_send(chat_id, build_success_invoice(res), reply_markup=get_main_keyboard())
        else:
            tg_send(chat_id, f"❌ <b>កំហុស៖</b> {escape_html(res.get('message', 'មិនអាចបង្កើត Key បានទេ'))}", reply_markup=get_main_keyboard())
        return

# --- MAIN LOOP ---

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    print("=" * 60, flush=True)
    print("  JAI DUBBER - TELEGRAM LICENSE BOT DAEMON (24/7 CLOUD)", flush=True)
    print("=" * 60, flush=True)
    print(f"[*] Admin IDs Allowed: {ADMIN_USER_IDS}", flush=True)
    print(f"[*] Supabase Endpoint: {SUPABASE_URL}", flush=True)

    try:
        r = requests.get(f"{TELEGRAM_API}/getMe", timeout=10)
        bot_info = r.json()
        if bot_info.get("ok"):
            bot_name = bot_info["result"]["username"]
            print(f"[+] Bot Online: @{bot_name} (ID: {bot_info['result']['id']})", flush=True)
        else:
            print(f"[!] Bot getMe error: {bot_info}", flush=True)
            sys.exit(1)
    except Exception as e:
        print(f"[!] Cannot connect to Telegram: {e}", flush=True)
        sys.exit(1)

    offset = 0
    print("[+] Polling updates from Telegram...", flush=True)

    while True:
        try:
            url = f"{TELEGRAM_API}/getUpdates?offset={offset}&timeout=25"
            resp = requests.get(url, timeout=35)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok"):
                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        if "message" in update:
                            process_message(update["message"])
                        elif "callback_query" in update:
                            process_callback(update["callback_query"])
            elif resp.status_code == 409:
                print("[!] 409 Conflict: Another bot instance is polling this token. Retrying in 5s...", flush=True)
                time.sleep(5)
            else:
                time.sleep(2)
        except requests.exceptions.RequestException:
            time.sleep(3)
        except Exception as e:
            print(f"[Error] Unexpected: {e}", flush=True)
            time.sleep(2)

if __name__ == "__main__":
    main()
