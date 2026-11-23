package sk.lekto.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class ReminderReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "lekto_study_reminders";
    public static final String EXTRA_ID = "lekto_reminder_id";
    public static final String EXTRA_TITLE = "lekto_reminder_title";
    public static final String EXTRA_BODY = "lekto_reminder_body";
    public static final String EXTRA_SUBJECT_ID = "lekto_reminder_subject_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }
        }

        ensureChannel(context);

        int id = intent.getIntExtra(EXTRA_ID, 1001);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String subjectId = intent.getStringExtra(EXTRA_SUBJECT_ID);
        if (title == null || title.isEmpty()) title = context.getString(R.string.app_name);
        if (body == null) body = "";

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (subjectId != null && !subjectId.isEmpty()) {
            open.putExtra(EXTRA_SUBJECT_ID, subjectId);
        }

        PendingIntent tap = PendingIntent.getActivity(
                context,
                id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.colorPrimary))
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(tap);

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Denný plán učenia",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        ch.setDescription("Lokálne pripomienky denného plánu do skúšky.");
        nm.createNotificationChannel(ch);
    }
}
