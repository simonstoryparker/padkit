-- Best-effort Accessibility automation. Only touches named controls in the selected browser.
on run argv
 set appName to item 1 of argv
 set extensionFolder to item 2 of argv
 tell application "System Events"
  if not UI elements enabled then return "accessibility unavailable"
  if not (exists process appName) then return "browser unavailable"
  tell process appName
   set frontmost to true
   repeat 20 times
    if exists front window then exit repeat
    delay 0.2
   end repeat
   if not (exists front window) then return "window unavailable"
   set controls to entire contents of front window
   repeat with uiElement in controls
    try
     if role of uiElement is "AXCheckBox" and name of uiElement is "Developer mode" then
      if value of uiElement is 0 then click uiElement
     end if
    end try
   end repeat
   delay 0.5
   set foundLoad to false
   set controls to entire contents of front window
   repeat with uiElement in controls
    try
     if role of uiElement is "AXButton" and name of uiElement is "Load unpacked" then
      click uiElement
      set foundLoad to true
      exit repeat
     end if
    end try
   end repeat
   if not foundLoad then return "manual load required"
   delay 0.7
   -- Do not type into the page if a folder picker did not open.
   if not (exists sheet 1 of front window) then return "manual folder selection required"
   keystroke "g" using {command down, shift down}
   delay 0.3
   keystroke extensionFolder
   key code 36
   delay 0.5
   key code 36
   return "submitted"
  end tell
 end tell
end run
