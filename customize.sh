#!/system/bin/sh
TargetDevice="fog"

Die() {
    command -v abort > /dev/null 2>&1 && abort "$1"
    echo "$1" >&2
    exit 1
}

[ -n "$MODPATH" ] || Die "MODPATH is Not Set"

Print() { ui_print "- $*"; }

ReportDevice() {
    Print "Checking Device Compatibility..."
    Print "Brand: $(resetprop ro.product.brand)"
    Print "Model: $(resetprop ro.product.model)"
    Print "Android: $(resetprop ro.build.version.release)"
    Print "Kernel: $(uname -r)"
    Print "Architecture: $(resetprop ro.product.cpu.abi)"
}

ConfigureVendor() {
    Device=$(resetprop ro.product.device 2> /dev/null)
    [ -n "$Device" ] || Die "Unable to read device codename"
    if [ "$Device" = "$TargetDevice" ]; then
        [ -f "$MODPATH/system/vendor/etc/wifi/WCNSS_qcom_cfg.ini" ] || Die "Vendor Wi-Fi configuration is missing"
        Print "Device is $TargetDevice"
    else
        Print "Device isn't $TargetDevice"
        Print "Delete Vendor Configuration"
        rm -rf "$MODPATH/system/vendor" || Die "Unable to delete vendor configuration"
    fi
}

ReportDevice
ConfigureVendor
Print "Configuring Network..."
Print "Installing VinNet..."
