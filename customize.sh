#!/system/bin/sh
LATESTARTSERVICE=true

readonly TargetDevice="fog"
readonly MetaModules="/data/adb/modules/magic_mount_rs /data/adb/modules/hybrid_mount /data/adb/modules/meta-mm /data/adb/modules/meta-overlayfs /data/adb/modules/magisk_overlayfs /data/adb/modules/mountify"
readonly InstalledModule="/data/adb/modules/VinNet"
readonly BinaryPath="$MODPATH/system/bin/iw"

sleep 0.5
[ -n "$MODPATH" ] || abort "MODPATH is Not Set"

Print() { ui_print "- $*"; }
HasSystemBinary() { [ -f "/system/bin/iw" ] || [ -f "/vendor/bin/iw" ]; }
HasInstalledBinary() { [ -f "$InstalledModule/system/bin/iw" ]; }
UseSystemBinary() { HasSystemBinary && ! HasInstalledBinary; }

FindMetaModule() {
    for Target in $MetaModules; do
        if [ -d "$Target" ]; then
            basename "$Target"
            return 0
        fi
    done
    return 1
}

BinaryForArch() {
    case "$ARCH" in
        arm64) echo "iw-arm64" ;;
        arm) echo "iw-arm" ;;
        *) return 1 ;;
    esac
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
    Print "Brand: $(getprop ro.product.brand)"
    Print "Model: $(getprop ro.product.model)"
    Print "Android: $(getprop ro.build.version.release)"
    Print "Kernel: $(uname -r)"
    Print "Architecture: $(getprop ro.product.cpu.abi)"
}

ConfigureVendor() {
    if [ "$(getprop ro.product.device)" = "$TargetDevice" ]; then
        Print "Device is $TargetDevice"
    else
        Print "Device isn't $TargetDevice"
        Print "Delete Vendor Configuration"
        rm -rf "$MODPATH/system/vendor"
    fi
}

ProvisionBinary() {
    Print "Checking Binary Dependencies..."
    if UseSystemBinary; then
        Print "Using Built-in Binary..."
        return
    fi

    local Source
    Source=$(BinaryForArch) || abort "Architecture not Supported: $ARCH"
    Print "Built-in Binary not Detected, Installing Binary..."
    cp -f "$MODPATH/binaries/$Source" "$BinaryPath" || abort "Failed to Install iw Binary"
}

SetPermission() {
    [ -f "$BinaryPath" ] || return
    Print "Setting Permissions..."
    set_perm "$BinaryPath" 0 0 0755
}

ReportCredit() {
    Print "Credit: Vinzz"
    Print "TikTok: @vinzz.fog"
    Print "GitHub: @Vinzz1234567890"
}

ConfigureMount "$(FindMetaModule)"
ReportDevice
ConfigureVendor
ProvisionBinary
ReportCredit
SetPermission
Print "Configuring Network..."
Print "Installing VinNet..."
