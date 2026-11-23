package sk.lekto.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "LektoNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class LektoNativePlugin extends Plugin {
    private static final int MIN_REMINDER_ID = 1001;
    private static final int MAX_REMINDER_ID = 1020;

    @PluginMethod
    public void setChrome(PluginCall call) {
        String hex = call.getString("color", "#f5f2eb");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                int color = Color.parseColor(hex);
                Window window = activity.getWindow();
                WindowCompat.setDecorFitsSystemWindows(window, false);
                window.getDecorView().setBackgroundColor(color);
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().setBackgroundColor(color);
                }
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(!dark);
                    controller.setAppearanceLightNavigationBars(!dark);
                }
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    @PluginMethod
    public void haptic(PluginCall call) {
        String style = call.getString("style", "light");
        Activity activity = getActivity();
        if (activity == null || getBridge() == null || getBridge().getWebView() == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            View v = getBridge().getWebView();
            int code;
            if ("error".equals(style)) {
                code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.REJECT
                        : HapticFeedbackConstants.LONG_PRESS;
            } else if ("success".equals(style)) {
                code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.CONFIRM
                        : HapticFeedbackConstants.VIRTUAL_KEY;
            } else if ("selection".equals(style)) {
                code = HapticFeedbackConstants.CLOCK_TICK;
            } else {
                code = HapticFeedbackConstants.CONTEXT_CLICK;
            }
            v.performHapticFeedback(code);
            call.resolve();
        });
    }

    @PluginMethod
    public void minimizeApp(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> activity.moveTaskToBack(true));
        }
        call.resolve();
    }

    @PluginMethod
    public void reminderPermission(PluginCall call) {
        JSObject out = new JSObject();
        out.put("state", currentNotificationState());
        call.resolve(out);
    }

    @PluginMethod
    public void requestReminderPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject out = new JSObject();
            out.put("state", NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied");
            call.resolve(out);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject out = new JSObject();
            out.put("state", "granted");
            call.resolve(out);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        JSObject out = new JSObject();
        out.put("state", getPermissionState("notifications") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(out);
    }

    @PluginMethod
    public void scheduleReminders(PluginCall call) {
        Context ctx = getContext();
        ReminderReceiver.ensureChannel(ctx);
        cancelScheduledAlarms(ctx);

        JSArray items = call.getArray("items");
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (items == null || am == null) {
            call.resolve();
            return;
        }
        long now = System.currentTimeMillis();
        for (int i = 0; i < items.length(); i++) {
            try {
                JSONObject it = items.getJSONObject(i);
                int id = it.optInt("id", MIN_REMINDER_ID + i);
                long atMs = it.optLong("atMs", 0L);
                if (atMs <= now) continue;
                Intent intent = new Intent(ctx, ReminderReceiver.class);
                intent.putExtra(ReminderReceiver.EXTRA_ID, id);
                intent.putExtra(ReminderReceiver.EXTRA_TITLE, it.optString("title", ""));
                intent.putExtra(ReminderReceiver.EXTRA_BODY, it.optString("body", ""));
                intent.putExtra(ReminderReceiver.EXTRA_SUBJECT_ID, it.optString("subjectId", ""));
                PendingIntent pi = PendingIntent.getBroadcast(
                        ctx,
                        id,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                // Inexact idle-safe alarm: no SCHEDULE_EXACT_ALARM Play Store special permission required.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelReminders(PluginCall call) {
        Context ctx = getContext();
        cancelScheduledAlarms(ctx);
        NotificationManagerCompat.from(ctx).cancelAll();
        call.resolve();
    }

    private String currentNotificationState() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied";
        }
        PermissionState st = getPermissionState("notifications");
        if (st == PermissionState.GRANTED) {
            return NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied";
        }
        if (st == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private void cancelScheduledAlarms(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int id = MIN_REMINDER_ID; id <= MAX_REMINDER_ID; id++) {
            Intent intent = new Intent(ctx, ReminderReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    ctx,
                    id,
                    intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pi != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
    }
}
