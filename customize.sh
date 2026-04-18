#!/system/bin/sh
LATESTARTSERVICE=true
sleep 0.2
ui_print "──────────────────────────────────────────────"
MetaModules="/data/adb/modules/magic_mount_rs /data/adb/modules/hybrid_mount /data/adb/modules/meta-mm /data/adb/modules/meta-overlayfs /data/adb/modules/magisk_overlayfs /data/adb/modules/mountify"
MetaModule=false
for target in $MetaModules; do
    if [ -d "$target" ]; then
        ui_print "- Meta Module Detected: $(basename $target)"
        MetaModule=true
        break
    fi
done
sleep 0.2
if [ "$MetaModule" = true ]; then
    ui_print "- Using $(basename $target) Mounting Method"
    SKIPMOUNT=true
else
    ui_print "- Using Standard Mounting Method"
    SKIPMOUNT=false
fi
sleep 0.2
ui_print "──────────────────────────────────────────────"
ui_print "- Checking Device Compatibility..."
sleep 0.2
ui_print "- Device Brand: $(getprop ro.product.brand)"
ui_print "- Device Model: $(getprop ro.product.model)"
ui_print "- OS Version: Android $(getprop ro.build.version.release)"
ui_print "- Kernel: $(uname -r)"
ui_print "- Architecture: $(getprop ro.product.cpu.abilist)"

if [ "$(getprop ro.product.device)" = "fog" ]; then
    ui_print "- Device is fog"
else
    ui_print "- Device isn't fog"
    sleep 0.2
    ui_print "- Delete vendor Configuration"
    rm -rf "$MODPATH/system/vendor"
fi
sleep 0.2
ui_print "──────────────────────────────────────────────"
ui_print "Checking Binary Dependencies..."
sleep 0.2
if [ -f "/system/bin/iw" ] || [ -f "/vendor/bin/iw" ]; then
    if [ -f "/data/adb/modules/VinNet/system/bin/iw" ]; then
        ui_print "- Built-in Binary not Detected, Installing binary..."
        BIN=true
    else
        ui_print "- Using Built-in Binary..."
        BIN=false
    fi
else
    ui_print "- Built-in Binary not Detected, Installing binary..."
    BIN=true
fi
if [ "$BIN" = "true" ]; then
    case $ARCH in
    arm64) cp -f "$MODPATH/binaries/iw-arm64" "$MODPATH/system/bin/iw" ;;
    arm) cp -f "$MODPATH/binaries/iw-arm" "$MODPATH/system/bin/iw" ;;
    *) abort "Architecture not Supported" ;;
    esac
fi
sleep 0.2
ui_print "──────────────────────────────────────────────"
ui_print "- Credit: Vinzz"
ui_print "- TikTok: @vinzz.fog"
ui_print "- GitHub: @Vinzz1234567890"
sleep 0.2
ui_print "──────────────────────────────────────────────"
ui_print "- Setting Permissions..."
set_perm "$MODPATH/system/bin/iw" 0 0 0755
sleep 0.2
ui_print "- Configurating Network..."
sleep 0.2
ui_print "- Installing VinNet..."
sleep 0.2
ui_print "──────────────────────────────────────────────"
am start -a android.intent.action.VIEW -d "https://github.com/Vinzz1234567890/VinNet.git" >/dev/null 2>&1
