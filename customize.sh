#!/system/bin/sh
LATESTARTSERVICE=true

readonly TargetDevice="fog"

sleep 0.5
[ -n "$MODPATH" ] || abort "MODPATH is Not Set"

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
    if [ "$(resetprop ro.product.device)" = "$TargetDevice" ]; then
        Print "Device is $TargetDevice"
    else
        Print "Device isn't $TargetDevice"
        Print "Delete Vendor Configuration"
        rm -rf "$MODPATH/system/vendor"
    fi
}

ReportDevice
ConfigureVendor
Print "Configuring Network..."
Print "Installing VinNet..."
