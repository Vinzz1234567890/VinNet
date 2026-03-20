#!/system/bin/sh
PROPFILE=false
POSTFSDATA=false
LATESTARTSERVICE=true
sleep 2
ui_print "--------------------------------------------------"
MetaModules="/data/adb/modules/magic_mount_rs /data/adb/modules/hybrid_mount /data/adb/modules/meta-mm /data/adb/modules/meta-overlayfs /data/adb/modules/magisk_overlayfs /data/adb/modules/mountify"
MetaModule=false
for target in $MetaModules; do
    if [ -d "$target" ]; then
        ui_print "- Meta Module Detected: $(basename $target)"
        MetaModule=true
        break
    fi
done
sleep 1
if [ "$MetaModule" = true ]; then
    ui_print "- Using the Meta Module Installation Method"
    SKIPMOUNT=true
else
    ui_print "- Using the KernelSU Installation Method"
    SKIPMOUNT=false
fi
sleep 2
ui_print "--------------------------------------------------"
ui_print "- Checking Device Compatibility..."
sleep 3
ui_print "- Device Brand: $(getprop ro.product.brand)"
sleep 1
ui_print "- Device Model: $(getprop ro.product.model)"
sleep 1
ui_print "- OS Version: Android $(getprop ro.build.version.release)"
sleep 1
ui_print "- Kernel: $(uname -r)"
sleep 1
ui_print "- Architecture: $(getprop ro.product.cpu.abilist)"
sleep 1
if [ "$(getprop ro.product.device)" == "fog" ]; then
    ui_print "- Device is fog"
else
    ui_print "- Device isn't fog"
    sleep 1
    ui_print "- Delete vendor Configuration"
    rm -rf "$MODPATH/vendor"
fi
sleep 2
ui_print "--------------------------------------------------"
ui_print "- Updates:"
sleep 1
while read -r line; do
    [ -z "$line" ] && continue
    ui_print "- $line"
done <"$MODPATH/updates.txt"
sleep 2
ui_print "--------------------------------------------------"
ui_print "- Notes:"
sleep 1
ui_print "- This module is still under development and may cause system instability or bootloop on your device."
ui_print "For now, i don't recommend using this module on devices other than the FOG (Redmi 10C), as testing has only been conducted on the FOG."
ui_print "I will do their best to improve this module."
ui_print "If you encounter any issues while using this module, please report them to developer."
sleep 2
ui_print "--------------------------------------------------"
ui_print "- Credit: Vinzz (Developer)"
ui_print "- TikTok: @vinzz.fog"
ui_print "- GitHub: @Vinzz1234567890"
sleep 2
ui_print "--------------------------------------------------"
ui_print "- Setting Permissions..."
sleep 3
ui_print "- Configurating Network..."
sleep 3
ui_print "- Installing VinNet..."
sleep 2
ui_print "--------------------------------------------------"
am start -a android.intent.action.VIEW -d "https://github.com/Vinzz1234567890/VinNet.git" >/dev/null 2>&1
