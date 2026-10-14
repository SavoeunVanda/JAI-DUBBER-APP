Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node scripts/telegram-bot.cjs", 0, False
