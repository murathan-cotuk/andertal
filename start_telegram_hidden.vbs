' start_telegram_hidden.vbs — Telegram listener'ı görünür pencere olmadan başlatır.
' Windows Task Scheduler (oturum açılışında) tarafından çağrılır.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Lenovo\Desktop\Ortam\Yazilim\andertal"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\Lenovo\Desktop\Ortam\Yazilim\andertal\telegram_listener.js""", 0, False
