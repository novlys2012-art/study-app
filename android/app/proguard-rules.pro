# Keep Lekto Capacitor plugin, BroadcastReceiver, and Capacitor runtime classes intact under R8/ProGuard.
-keep class sk.lekto.app.** { *; }
-keep class com.getcapacitor.** { *; }
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}
