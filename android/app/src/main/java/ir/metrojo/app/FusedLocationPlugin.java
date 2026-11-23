package ir.metrojo.app;

/* ============================================================
   درمسیر — پلاگین موقعیت دقیق گوگل (FusedLocationProviderClient)
   همان موتور موقعیت‌یاب Google Maps: ترکیب GPS + وای‌فای + آنتن‌دهی
   + سنسورها با سرویس‌های گوگل پلی (Google Play Services).
   دلیل وجود: پلاگین پیش‌فرض Capacitor روی اندروید از LocationManager
   خام سیستم استفاده می‌کند که در برخی دستگاه‌ها کند و ناعدد است و
   باعث «لوکیشن اشتباه» می‌شد.
   فقط getCurrentPosition لازم است — رصد پیوسته در سمت JS با تایمر
   روی همین متد انجام می‌شود (geo.ts).
   ============================================================ */

import android.location.Location;
import android.Manifest;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

@CapacitorPlugin(name = "FusedLocation", permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location")
})
public class FusedLocationPlugin extends Plugin {

    private FusedLocationProviderClient client;

    private FusedLocationProviderClient getClient() {
        if (client == null) {
            client = LocationServices.getFusedLocationProviderClient(getContext());
        }
        return client;
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private JSObject makeResult(Location loc) {
        JSObject ret = new JSObject();
        ret.put("lat", loc.getLatitude());
        ret.put("lng", loc.getLongitude());
        ret.put("accuracy", loc.hasAccuracy() ? loc.getAccuracy() : -1.0);
        ret.put("altitude", loc.hasAltitude() ? loc.getAltitude() : -1.0);
        ret.put("timestamp", loc.getTime());
        return ret;
    }

    /** یک‌بار موقعیت دقیق — موتور Fused گوگل (مثل Google Maps) */
    @PluginMethod
    public void getCurrentPosition(final PluginCall call) {
        if (!hasPermission()) {
            call.reject("PERMISSION_DENIED");
            return;
        }
        boolean high = call.getBoolean("enableHighAccuracy", true);
        long timeout = call.getInt("timeout", 15000);
        int priority = high ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY;

        CurrentLocationRequest req = new CurrentLocationRequest.Builder()
                .setPriority(priority)
                .setDurationMillis(Math.min(Math.max(timeout, 3000L), 30000L))
                .setMaxUpdateAgeMillis(0L) // موقعیت تازه — نه کش قدیمی دستگاه
                .build();

        try {
            getClient().getCurrentLocation(req, new CancellationTokenSource().getToken())
                    .addOnSuccessListener(loc -> {
                        if (loc != null) {
                            call.resolve(makeResult(loc));
                        } else {
                            requestFresh(call, priority, timeout);
                        }
                    })
                    .addOnFailureListener(e -> requestFresh(call, priority, timeout));
        } catch (Exception ex) {
            call.reject("POSITION_UNAVAILABLE");
        }
    }

    /** فالبک: درخواست تازه با همان موتور — getLastLocation می‌تواند موقعیت کهنه/ناعدد بدهد */
    private void requestFresh(final PluginCall call, int priority, long timeout) {
        try {
            CurrentLocationRequest req = new CurrentLocationRequest.Builder()
                    .setPriority(priority)
                    .setDurationMillis(Math.min(Math.max(timeout, 3000L), 30000L))
                    .build();
            getClient().getCurrentLocation(req, new CancellationTokenSource().getToken())
                    .addOnSuccessListener(loc -> {
                        if (loc != null) call.resolve(makeResult(loc));
                        else call.reject("POSITION_UNAVAILABLE");
                    })
                    .addOnFailureListener(e -> call.reject("POSITION_UNAVAILABLE"));
        } catch (Exception ex) {
            call.reject("POSITION_UNAVAILABLE");
        }
    }
}
