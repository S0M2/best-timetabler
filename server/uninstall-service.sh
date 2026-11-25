#!/bin/bash
PLIST_NAME="be.henallux.best-timetabler.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"

launchctl unload "$TARGET_PLIST" 2>/dev/null
rm -f "$TARGET_PLIST"

echo "🛑 Service Best Timetabler désinstallé."
