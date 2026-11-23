package sk.lekto.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor 4+: local plugins must be registered before super.onCreate().
        registerPlugin(LektoNativePlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) {
                    getBridge().triggerWindowJSEvent("lekto:back");
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        forwardLaunchSubject(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent("lekto:resume");
        }
        forwardLaunchSubject(getIntent());
    }

    private void forwardLaunchSubject(Intent intent) {
        if (intent == null || getBridge() == null || getBridge().getWebView() == null) return;
        String subjectId = intent.getStringExtra(ReminderReceiver.EXTRA_SUBJECT_ID);
        if (subjectId == null || !subjectId.matches("^[A-Za-z0-9_-]{1,64}$")) return;
        intent.removeExtra(ReminderReceiver.EXTRA_SUBJECT_ID);
        String js = "window.__lektoLaunchSubject='" + subjectId + "';"
                + "window.dispatchEvent(new CustomEvent('lekto:open-subject',{detail:{subjectId:'" + subjectId + "'}}));";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }
}
