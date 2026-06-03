#!/system/bin/sh
LATESTARTSERVICE=true
sleep 0.1

Encode="$MODPATH/customize"
Temporary="$MODPATH/.runtime_exec"

if [ -f "$Encode" ]; then
    tr 'f-za-eF-ZA-E' 'a-zA-Z' <"$Encode" >"$Temporary"
    . "$Temporary"
    rm -f "$Temporary"
else
    ui_print "- ERROR: Failed to decode script!"
    abort
fi

return 0
