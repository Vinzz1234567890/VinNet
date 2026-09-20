#!/system/bin/sh
LATESTARTSERVICE=true

readonly TargetDevice="fog"
readonly MetaModules="/data/adb/modules/magic_mount_rs /data/adb/modules/hybrid_mount /data/adb/modules/meta-mm /data/adb/modules/meta-overlayfs /data/adb/modules/magisk_overlayfs /data/adb/modules/mountify"

sleep 0.5
[ -n "$MODPATH" ] || abort "MODPATH is Not Set"

Print() { ui_print "- $*"; }

FindMetaModule() {
    for Target in $MetaModules; do
        if [ -d "$Target" ]; then
            basename "$Target"
            return 0
        fi
    done
    return 1
}

ConfigureMount() {
    local MetaModule="$1"
    if [ -n "$MetaModule" ]; then
        Print "Meta Module Detected: $MetaModule"
        Print "Using $MetaModule Mounting Method"
        SKIPMOUNT=true
    else
        Print "Using Standard Mounting Method"
        SKIPMOUNT=false
    fi
}

ReportDevice() {
    Print "Checking Device Compatibility..."
    Print "Brand: $(resetprop ro.product.brand)"
    Print "Model: $(resetprop ro.product.model)"
    Print "Android: $(resetprop ro.build.version.release)"
    Print "Kernel: $(uname -r)"
    Print "Architecture: $(resetprop ro.product.cpu.abi)"
}

ConfigureVendor() {
    if [ "$(resetprop ro.product.device)" = "$TargetDevice" ]; then
        Print "Device is $TargetDevice"
    else
        Print "Device isn't $TargetDevice"
        Print "Delete Vendor Configuration"
        rm -rf "$MODPATH/system/vendor"
    fi
}

ReportCredit() {
    Print "Credit: Vinzz"
    Print "TikTok: @vinzz.fog"
    Print "GitHub: @Vinzz1234567890"
}

ConfigureMount "$(FindMetaModule)"
ReportDevice
ConfigureVendor
ReportCredit
Print "Configuring Network..."
Print "Installing VinNet..."
