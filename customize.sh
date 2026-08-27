#!/system/bin/sh
LATESTARTSERVICE=true
sleep 1
ui_print "──────────────────────────────────────────────"
MetaModules="/data/adb/modules/magic_mount_rs /data/adb/modules/hybrid_mount /data/adb/modules/meta-mm /data/adb/modules/meta-overlayfs /data/adb/modules/magisk_overlayfs /data/adb/modules/mountify"
MetaModule=false

for target in $MetaModules; do
    if [ -d "$target" ]; then
        ui_print "- Meta Module Detected: $(basename "$target")"
        MetaModule=true
        break
    fi
done

if [ "$MetaModule" = true ]; then
    ui_print "- Using $(basename "$target") Mounting Method"
    SKIPMOUNT=true
else
    ui_print "- Using Standard Mounting Method"
    SKIPMOUNT=false
fi

ui_print "- Checking Device Compatibility..."
ui_print "- Brand: $(getprop ro.product.brand)"
ui_print "- Model: $(getprop ro.product.model)"
ui_print "- Android: $(getprop ro.build.version.release)"
ui_print "- Kernel: $(uname -r)"
ui_print "- Architecture: $(getprop ro.product.cpu.abi)"

if [ "$(getprop ro.product.device)" = "fog" ]; then
    ui_print "- Device is fog"
else
    ui_print "- Device isn't fog"
    ui_print "- Delete vendor Configuration"
    rm -rf "$MODPATH/system/vendor"
fi

ui_print "Checking Binary Dependencies..."

Binary=true
if { [ -f "/system/bin/iw" ] || [ -f "/vendor/bin/iw" ]; } && [ ! -f "/data/adb/modules/VinNet/system/bin/iw" ]; then
    ui_print "- Using Built-in Binary..."
    Binary=false
else
    ui_print "- Built-in Binary not Detected, Installing binary..."
fi

if [ "$Binary" = "true" ]; then
    case $ARCH in
        arm64) cp -f "$MODPATH/binaries/iw-arm64" "$MODPATH/system/bin/iw" ;;
        arm) cp -f "$MODPATH/binaries/iw-arm" "$MODPATH/system/bin/iw" ;;
        *) abort "Architecture not Supported" ;;
    esac
fi

ui_print "- Credit: Vinzz"
ui_print "- TikTok: @vinzz.fog"
ui_print "- GitHub: @Vinzz1234567890"
if [ "$Binary" = true ]; then
    ui_print "- Setting Permissions..."
    set_perm "$MODPATH/system/bin/iw" 0 0 0755
fi
ui_print "- Configurating Network..."
ui_print "- Installing VinNet..."
ui_print "──────────────────────────────────────────────"
