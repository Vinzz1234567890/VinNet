#!/system/bin/sh
SKIPMOUNT=true
PROPFILE=false
POSTFSDATA=false
LATESTARTSERVICE=true

ui_print "--------------------------------------------------"
ui_print "- Device Brand: $(getprop ro.product.brand)"
sleep 0.5
ui_print "- Device Model: $(getprop ro.product.model)"
sleep 0.5
ui_print "- OS Version: Android $(getprop ro.build.version.release)"
sleep 0.5
ui_print "- Kernel: $(uname -r)"
sleep 0.5
ui_print "- Architecture: $(getprop ro.product.cpu.abilist)"
ui_print "--------------------------------------------------"
sleep 1
ui_print "--------------------------------------------------"
ui_print "- Checking Device Compatibility..."
sleep 0.5
if [ "$(getprop ro.product.device)" == "fog" ]; then
    ui_print "- Device is fog"
else
    ui_print "- Device isn't fog"
    sleep 0.5
    ui_print "- Delete vendor Configuration"
    rm -rf "$MODPATH/system/vendor"
fi
ui_print "--------------------------------------------------"
sleep 1
ui_print "--------------------------------------------------"
ui_print "- Updates:"
sleep 0.5
while read -r line; do
    [ -z "$line" ] && continue
    ui_print "- $line"
    sleep 0.5
done <"$MODPATH/updates.txt"
ui_print "--------------------------------------------------"
sleep 1
ui_print "--------------------------------------------------"
ui_print "- Setting Permissions..."
sleep 0.5
ui_print "- Configurating Network..."
sleep 0.5
ui_print "- Installing VinNet..."
ui_print "--------------------------------------------------"
sleep 1
ui_print "--------------------------------------------------"
ui_print "- Note: This module is still under development"
ui_print "        and may cause system instability"
ui_print "        or bootloop on your device."
sleep 0.5
ui_print "        For now, i don't recommend"
ui_print "        using this module"
ui_print "        on devices other than the FOG (Redmi 10C),"
ui_print "        as testing has"
ui_print "        only been conducted on the FOG."
sleep 0.5
ui_print "        I will do their best"
ui_print "        to improve this module."
sleep 0.5
ui_print "        If you encounter any issues"
ui_print "        while using this module,"
ui_print "        please report them to developer."
ui_print "--------------------------------------------------"
sleep 1
ui_print "--------------------------------------------------"
ui_print "- Credit: Vinzz (Developer)"
ui_print "- TikTok: @vinzz.fog"
ui_print "- GitHub: @Vinzz1234567890"
ui_print "--------------------------------------------------"
sleep 1
