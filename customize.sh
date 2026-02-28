#!/system/bin/sh
SKIPMOUNT=true
PROPFILE=false
POSTFSDATA=false
LATESTARTSERVICE=true

ui_print "-----------------------------------------------------"
ui_print "- Update: Fixed Wifi Not Connect"
ui_print "-----------------------------------------------------"
sleep 1
ui_print "- Device Brand: $(getprop ro.product.brand)"
ui_print "- Device Model: $(getprop ro.product.model)"
ui_print "- OS Version: Android $(getprop ro.build.version.release)"
ui_print "- Kernel: $(uname -r)"
ui_print "- Architecture: $(getprop ro.product.cpu.abilist)"
sleep 1
ui_print "- Setting Permissions..."
sleep 1
ui_print "- Configurating Network..."
sleep 1
ui_print "- Installing VinNet..."
sleep 1

