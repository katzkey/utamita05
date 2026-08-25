Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
' 第2引数 0 = ウィンドウ非表示 / 第3引数 False = 終了を待たない
sh.Run """" & base & "\start_helper.bat""", 0, False
