package com.nanofuxion.tamerdevclient

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.SensorManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.zxing.integration.android.IntentIntegrator
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.nanofuxion.tamerdevclient.BuildConfig
import com.lynx.tasm.LynxView
import com.lynx.tasm.behavior.LynxContext
import com.squareup.seismic.ShakeDetector as SeismicShakeDetector
import com.nanofuxion.tamerdevclient.nsd.DiscoveredServer
import com.nanofuxion.tamerdevclient.nsd.NsdDiscovery
import org.json.JSONArray
import org.json.JSONObject

class DevClientModule(context: Context) : LynxModule(context) {

    companion object {
        private const val TAG = "DevClientModule"
        const val ACTION_RELOAD_PROJECT = "com.tamer4lynx.RELOAD_PROJECT"
        private const val PREFS = "tamer_dev_server"
        private const val KEY_URL = "dev_server_url"
        private const val KEY_RECENT = "dev_server_recent"
        private const val KEY_RECENT_V2 = "dev_server_recent_v2"
        private const val KEY_META_CACHE = "dev_server_meta_cache"
        private const val KEY_PROJECT_INIT_DATA = "project_init_data_json"
        private const val RECENT_SCHEMA_V = 1

        private val recentPrefsLock = Any()

        @JvmStatic
        fun getProjectInitDataJson(context: Context): String {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val base = prefs.getString(KEY_PROJECT_INIT_DATA, "{}") ?: "{}"
            val bundleUrl = prefs.getString(KEY_URL, null)?.trim().orEmpty()
            return withDevRuntimeInitData(base, bundleUrl)
        }

        private fun withDevRuntimeInitData(baseJson: String, bundleUrl: String): String {
            val root = try {
                JSONObject(baseJson)
            } catch (_: Exception) {
                JSONObject()
            }
            if (bundleUrl.isNotBlank()) root.put("bundleUrl", bundleUrl)
            root.put("__tamerRuntime", JSONObject().apply {
                put("host", "tamer-dev-client")
                put("env", "development")
                if (bundleUrl.isNotBlank()) put("bundleUrl", bundleUrl)
            })
            return root.toString()
        }

        @Volatile
        var instance: DevClientModule? = null

        @Volatile
        private var hostActivity: Activity? = null

        @Volatile
        private var lynxViewRef: LynxView? = null

        private var requestCameraPermission: ((Runnable) -> Unit)? = null
        private var launchScan: Runnable? = null
        private var reloadProjectLauncher: Runnable? = null

        fun attachHostActivity(activity: Activity?) {
            hostActivity = activity
            if (activity != null) {
                try {
                    PerfSampler.ensureStarted(activity.applicationContext)
                    PerfSampler.setActive(true)
                    PerfSampler.setListener { sample ->
                        val inst = instance
                        if (inst != null) {
                            inst.emitPerfSample(sample)
                        } else {
                            lynxViewRef?.sendGlobalEvent(
                                "devclient:perfSample",
                                buildPerfSampleParams(sample),
                            )
                        }
                    }
                } catch (_: Throwable) {
                }
            }
        }

        internal fun buildPerfSampleParams(sample: PerfSampler.Sample): JavaOnlyArray {
            val map = JavaOnlyMap()
            map.putDouble("t", sample.t.toDouble())
            map.putDouble("frametimeMs", sample.frametimeMs)
            map.putDouble("cpuPct", sample.cpuPct)
            map.putInt("avgFps", sample.avgFps)
            val params = JavaOnlyArray()
            params.pushMap(map)
            return params
        }

        fun attachLynxView(view: LynxView?) {
            lynxViewRef = view
        }

        /// Gate sampler to ProjectActivity foreground (called from onResume/onPause).
        @JvmStatic
        fun setProjectActive(active: Boolean) {
            PerfSampler.setActive(active)
        }

        fun attachCameraPermissionRequester(requester: (Runnable) -> Unit) {
            requestCameraPermission = requester
        }

        fun attachScanLauncher(launcher: Runnable) {
            launchScan = launcher
        }

        fun attachReloadProjectLauncher(launcher: Runnable?) {
            reloadProjectLauncher = launcher
        }

        @Volatile
        private var supportedModuleClassNames: Set<String> = emptySet()

        fun attachSupportedModuleClassNames(names: List<String>) {
            supportedModuleClassNames = names.filter { it.isNotBlank() }.toSet()
        }

        fun getSupportedModuleClassNames(): Set<String> = supportedModuleClassNames

        private var openProjectDirectLauncher: ((String) -> Unit)? = null

        fun attachOpenProjectDirectLauncher(launcher: ((String) -> Unit)?) {
            openProjectDirectLauncher = launcher
        }

        @Volatile
        private var seismicShakeDetector: SeismicShakeDetector? = null
        @Volatile
        private var onShakeCallback: (() -> Unit)? = null

        @JvmStatic
        fun notifyShakeDetected() {
            vibrateShakeFeedback()
            val callback = onShakeCallback
            if (callback != null) {
                callback.invoke()
                return
            }
            val map = JavaOnlyMap()
            map.putString("payload", "{}")
            val params = JavaOnlyArray()
            params.pushMap(map)
            val inst = instance
            if (inst != null) {
                inst.emitShakeGlobalEvent(params)
            } else {
                lynxViewRef?.sendGlobalEvent("devclient:shakeDetected", params)
            }
        }

        private fun stopShakeDetectorOnly() {
            seismicShakeDetector?.stop()
            seismicShakeDetector = null
        }

        @JvmStatic
        @JvmOverloads
        fun startShakeDetection(activity: Activity, onShake: (() -> Unit)? = null) {
            Log.d(TAG, "startShakeDetection called")
            stopShakeDetectorOnly()
            onShakeCallback = onShake
            val sm = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            val accel = sm.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)
            Log.d(TAG, "Accelerometer available: ${accel != null}")
            if (accel != null) {
                Log.d(TAG, "Accelerometer: ${accel.name}, power=${accel.power}mA, resolution=${accel.resolution}")
            }
            val detector = SeismicShakeDetector(
                SeismicShakeDetector.Listener {
                    Log.d(TAG, "Shake detected!")
                    notifyShakeDetected()
                },
            )
            try {
                if (!detector.start(sm)) {
                    Log.w(TAG, "Seismic ShakeDetector.start returned false (no accelerometer?)")
                } else {
                    Log.d(TAG, "Seismic shake detection started successfully")
                }
                seismicShakeDetector = detector
            } catch (e: SecurityException) {
                Log.w(TAG, "SecurityException starting shake detection: ${e.message}")
            } catch (e: Exception) {
                Log.w(TAG, "Exception starting shake detection: ${e.message}", e)
            }
        }

        @JvmStatic
        fun stopShakeDetection() {
            stopShakeDetectorOnly()
            onShakeCallback = null
        }

        @SuppressLint("MissingPermission")
        private fun vibrateShakeFeedback() {
            if (!BuildConfig.DEBUG) return
            val ctx = hostActivity?.applicationContext ?: return
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator?
            } ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(45)
            }
        }
    }

    private var nsdDiscovery: NsdDiscovery? = null
    private var lastDiscovered: List<DiscoveredServer> = emptyList()

    data class CompatibilityResult(val compatible: Boolean, val requiredModules: List<Pair<String, String>>)

    private fun buildProbeRequest(url: String, probe: String): okhttp3.Request {
        return okhttp3.Request.Builder()
            .url(url)
            .header("x-tamer-probe", probe)
            .build()
    }

    private fun devServerMetaBase(url: String): String {
        var t = url.trim().trimEnd('/')
        if (t.endsWith(".lynx.bundle", ignoreCase = true)) {
            val i = t.lastIndexOf('/')
            if (i > 0) return t.substring(0, i)
        }
        return t
    }

    private fun fetchMetaJSONObject(baseUrl: String, probe: String = "connect-meta"): JSONObject? {
        return try {
            val metaUrl = devServerMetaBase(baseUrl).trimEnd('/') + "/meta.json"
            val request = buildProbeRequest(metaUrl, probe)
            val client = okhttp3.OkHttpClient.Builder()
                .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful || response.body == null) return null
            JSONObject(response.body!!.string())
        } catch (_: Exception) {
            null
        }
    }

    private fun compatibilityFromMeta(json: JSONObject?, supported: Set<String>): CompatibilityResult {
        if (supported.isEmpty()) return CompatibilityResult(true, emptyList())
        if (json == null) return CompatibilityResult(true, emptyList())
        val arr = json.optJSONArray("nativeModules") ?: return CompatibilityResult(true, emptyList())
        val required = mutableListOf<Pair<String, String>>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val pkg = obj.optString("packageName", "")
            val cls = obj.optString("moduleClassName", "")
            if (cls.isNotBlank() && cls !in supported) {
                required.add(pkg to cls)
            }
        }
        return CompatibilityResult(required.isEmpty(), required)
    }

    private fun fetchMetaAndCheckCompatibility(baseUrl: String): CompatibilityResult? {
        val supported = DevClientModule.getSupportedModuleClassNames()
        val json = fetchMetaJSONObject(baseUrl, "compatibility-meta")
            ?: return if (supported.isEmpty()) CompatibilityResult(true, emptyList()) else null
        return compatibilityFromMeta(json, supported)
    }

    private fun isCompatibleWithOptionalMeta(baseUrl: String, meta: JSONObject?): Boolean {
        val supported = DevClientModule.getSupportedModuleClassNames()
        val json = meta ?: fetchMetaJSONObject(baseUrl, "discovery-meta") ?: return true
        return compatibilityFromMeta(json, supported).compatible
    }

    init {
        instance = this
    }

    fun setActivity(activity: Activity?) {
        attachHostActivity(activity)
    }

    fun setCameraPermissionRequester(requester: (Runnable) -> Unit) {
        attachCameraPermissionRequester(requester)
    }

    private fun getLynxContext(): LynxContext? = mContext as? LynxContext

    private fun emitShakeGlobalEvent(params: JavaOnlyArray) {
        val lynxContext = getLynxContext()
        if (lynxContext != null) {
            lynxContext.sendGlobalEvent("devclient:shakeDetected", params)
        } else {
            lynxViewRef?.sendGlobalEvent("devclient:shakeDetected", params)
        }
    }

    internal fun emitPerfSample(sample: PerfSampler.Sample) {
        val params = buildPerfSampleParams(sample)
        val lynxContext = getLynxContext()
        if (lynxContext != null) {
            lynxContext.sendGlobalEvent("devclient:perfSample", params)
        } else {
            lynxViewRef?.sendGlobalEvent("devclient:perfSample", params)
        }
    }

    @LynxMethod
    fun getPerfHistory(callback: Callback) {
        val arr = JavaOnlyArray()
        for (sample in PerfSampler.snapshot()) {
            val map = JavaOnlyMap()
            map.putDouble("t", sample.t.toDouble())
            map.putDouble("frametimeMs", sample.frametimeMs)
            map.putDouble("cpuPct", sample.cpuPct)
            map.putInt("avgFps", sample.avgFps)
            arr.pushMap(map)
        }
        callback.invoke(arr)
    }

    private fun emitDiscoveredServers(servers: List<DiscoveredServer>) {
        lastDiscovered = servers
        val arr = org.json.JSONArray()
        for (s in servers) {
            val obj = org.json.JSONObject()
            obj.put("url", s.url)
            obj.put("name", s.name)
            obj.put("compatible", s.compatible)
            if (s.iconUrl != null) obj.put("iconUrl", s.iconUrl)
            if (s.tamerAppKey != null) obj.put("tamerAppKey", s.tamerAppKey)
            arr.put(obj)
        }
        val payload = org.json.JSONObject().put("servers", arr).toString()
        val eventDetails = JavaOnlyMap()
        eventDetails.putString("payload", payload)
        val params = JavaOnlyArray()
        params.pushMap(eventDetails)
        val lynxContext = getLynxContext()
        if (lynxContext != null) {
            lynxContext.sendGlobalEvent("devclient:discoveredServers", params)
        } else {
            lynxViewRef?.sendGlobalEvent("devclient:discoveredServers", params)
        }
    }

    private fun prefs() = mContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun loadMetaCacheEntry(url: String): JSONObject? {
        val raw = prefs().getString(KEY_META_CACHE, "{}") ?: "{}"
        val root = try {
            JSONObject(raw)
        } catch (_: Exception) {
            JSONObject()
        }
        val entry = root.optJSONObject(url)
        if (entry != null) return entry
        val direct = root.opt(url)
        return if (direct is JSONObject) direct else null
    }

    private fun buildCurrentProjectDebugInfoMap(): JavaOnlyMap {
        val map = JavaOnlyMap()
        val currentUrl = prefs().getString(KEY_URL, null)?.takeIf { it.isNotBlank() }
        currentUrl?.let { map.putString("url", it) }

        val recent = currentUrl?.let { url ->
            loadRecentItems().firstOrNull { it.url == url }
        }
        val metaEntry = currentUrl?.let { loadMetaCacheEntry(it) }

        val iconUrl = recent?.iconUrl ?: metaEntry?.optString("iconUrl")?.takeIf { it.isNotBlank() }
        val label = recent?.label ?: metaEntry?.optString("label")?.takeIf { it.isNotBlank() }
        val tamerAppKey = recent?.tamerAppKey ?: metaEntry?.optString("tamerAppKey")?.takeIf { it.isNotBlank() }

        iconUrl?.let { map.putString("iconUrl", it) }
        label?.let { map.putString("label", it) }
        tamerAppKey?.let { map.putString("tamerAppKey", it) }
        return map
    }

    @LynxMethod
    fun getDevServerUrl(callback: Callback) {
        callback.invoke(prefs().getString(KEY_URL, null) ?: "")
    }

    @LynxMethod
    fun setDevServerUrl(url: String) {
        val normalized = url.trim().trimEnd('/')
        prefs().edit().putString(KEY_URL, normalized).commit()
        mergeRecentImmediate(normalized)
        Thread {
            try {
                enrichRecentWithMeta(normalized)
            } catch (_: Exception) {
            }
        }.start()
    }

    private data class RecentItem(
        val url: String,
        val tamerAppKey: String? = null,
        val label: String? = null,
        val iconUrl: String? = null,
    )

    private fun migrateLegacyRecentIfNeeded() {
        if (prefs().contains(KEY_RECENT_V2)) return
        val legacy = prefs().getString(KEY_RECENT, "[]") ?: "[]"
        val items = try {
            val ja = JSONArray(legacy)
            (0 until ja.length()).map { RecentItem(ja.getString(it)) }
        } catch (_: Exception) {
            emptyList()
        }
        val root = JSONObject()
        root.put("v", RECENT_SCHEMA_V)
        val arr = JSONArray()
        items.take(10).forEach { arr.put(recentItemToJson(it)) }
        root.put("items", arr)
        prefs().edit().putString(KEY_RECENT_V2, root.toString()).apply()
    }

    private fun recentItemToJson(i: RecentItem): JSONObject = JSONObject().apply {
        put("url", i.url)
        i.tamerAppKey?.let { put("tamerAppKey", it) }
        i.label?.let { put("label", it) }
        i.iconUrl?.let { put("iconUrl", it) }
    }

    private fun loadRecentItems(): List<RecentItem> {
        migrateLegacyRecentIfNeeded()
        val raw = prefs().getString(KEY_RECENT_V2, null) ?: return emptyList()
        return try {
            val root = JSONObject(raw)
            val items = root.optJSONArray("items") ?: return emptyList()
            (0 until items.length()).map { idx ->
                val o = items.getJSONObject(idx)
                RecentItem(
                    url = o.getString("url"),
                    tamerAppKey = o.optString("tamerAppKey").takeIf { it.isNotBlank() },
                    label = o.optString("label").takeIf { it.isNotBlank() },
                    iconUrl = o.optString("iconUrl").takeIf { it.isNotBlank() },
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveRecentItems(items: List<RecentItem>) {
        val arr = JSONArray()
        items.forEach { arr.put(recentItemToJson(it)) }
        val root = JSONObject()
        root.put("v", RECENT_SCHEMA_V)
        root.put("items", arr)
        prefs().edit().putString(KEY_RECENT_V2, root.toString()).apply()
    }

    private fun mergeRecentImmediate(url: String) {
        synchronized(recentPrefsLock) {
            migrateLegacyRecentIfNeeded()
            val current = loadRecentItems().filter { it.url != url }
            saveRecentItems((listOf(RecentItem(url = url)) + current).take(10))
        }
    }

    private fun buildProjectInitDataJson(meta: JSONObject?, bundleUrl: String): String {
        val o = JSONObject()
        if (bundleUrl.isNotBlank()) o.put("bundleUrl", bundleUrl)
        o.put("__tamerRuntime", JSONObject().apply {
            put("host", "tamer-dev-client")
            put("env", "development")
            if (bundleUrl.isNotBlank()) put("bundleUrl", bundleUrl)
        })
        if (meta == null) return o.toString()
        meta.optString("tamerAppKey").takeIf { it.isNotBlank() }?.let { o.put("tamerAppKey", it) }
        meta.optString("androidPackageName").takeIf { it.isNotBlank() }?.let { o.put("androidPackageName", it) }
        meta.optString("iosBundleId").takeIf { it.isNotBlank() }?.let { o.put("iosBundleId", it) }
        return if (o.length() == 0) "{}" else o.toString()
    }

    private fun updateMetaCacheJson(url: String, key: String?, icon: String?, label: String?) {
        val raw = prefs().getString(KEY_META_CACHE, "{}") ?: "{}"
        val root = try {
            JSONObject(raw)
        } catch (_: Exception) {
            JSONObject()
        }
        val entry = JSONObject()
        key?.let { entry.put("tamerAppKey", it) }
        icon?.let { entry.put("iconUrl", it) }
        label?.let { entry.put("label", it) }
        entry.put("updatedAt", System.currentTimeMillis())
        root.put(url, entry)
        prefs().edit().putString(KEY_META_CACHE, root.toString()).apply()
    }

    private fun enrichRecentWithMeta(normalizedUrl: String) {
        val meta = fetchMetaJSONObject(normalizedUrl)
        prefs().edit().putString(KEY_PROJECT_INIT_DATA, buildProjectInitDataJson(meta, normalizedUrl)).apply()
        val key = meta?.optString("tamerAppKey")?.takeIf { it.isNotBlank() }
        val icon = meta?.optString("icon")?.takeIf { it.isNotBlank() }
        val label = meta?.optString("name")?.takeIf { it.isNotBlank() }
        if (key != null || icon != null || label != null) {
            updateMetaCacheJson(normalizedUrl, key, icon, label)
        }
        synchronized(recentPrefsLock) {
            migrateLegacyRecentIfNeeded()
            val list = loadRecentItems()
            val others = list.filter { it.url != normalizedUrl }
                .filter { item -> key == null || item.tamerAppKey != key }
            val updated = RecentItem(
                url = normalizedUrl,
                tamerAppKey = key,
                label = label,
                iconUrl = icon,
            )
            saveRecentItems((listOf(updated) + others).take(10))
        }
    }

    @LynxMethod
    fun getRecentUrls(callback: Callback) {
        val arr = JavaOnlyArray()
        for (item in loadRecentItems()) arr.pushString(item.url)
        callback.invoke(arr)
    }

    @LynxMethod
    fun getRecentEntries(callback: Callback) {
        val arr = JavaOnlyArray()
        for (item in loadRecentItems()) {
            val map = JavaOnlyMap()
            map.putString("url", item.url)
            item.tamerAppKey?.let { map.putString("tamerAppKey", it) }
            item.label?.let { map.putString("label", it) }
            item.iconUrl?.let { map.putString("iconUrl", it) }
            arr.pushMap(map)
        }
        callback.invoke(arr)
    }

    @LynxMethod
    fun removeRecentUrl(url: String) {
        val trimmed = url.trim()
        synchronized(recentPrefsLock) {
            migrateLegacyRecentIfNeeded()
            saveRecentItems(loadRecentItems().filter { it.url != trimmed })
        }
    }

    @LynxMethod
    fun clearDevServerUrl() {
        prefs().edit().clear().apply()
    }

    @LynxMethod
    fun scanQR() {
        val activity = hostActivity ?: (mContext as? LynxContext)?.activity as? Activity
        if (activity == null) {
            Log.e(TAG, "No activity for QR scan")
            emitScanResult(null)
            return
        }
        activity.runOnUiThread {
            if (ContextCompat.checkSelfPermission(mContext, android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                launchScanner()
                return@runOnUiThread
            }
            val requester = requestCameraPermission
            if (requester != null) {
                requester(Runnable { launchScanner() })
            } else {
                Log.e(TAG, "No camera permission requester set; call setCameraPermissionRequester from Activity")
                emitScanResult(null)
            }
        }
    }

    private fun launchScanner() {
        launchScan?.run() ?: run {
            val activity = hostActivity
            if (activity != null) {
                IntentIntegrator(activity).setPrompt("Scan dev server QR").initiateScan()
            } else {
                Log.e(TAG, "No scan launcher or activity for QR scan")
                emitScanResult(null)
            }
        }
    }

    fun deliverScanResult(contents: String?) {
        emitScanResult(contents)
    }

    private fun emitScanResult(url: String?) {
        val json = JSONObject().apply { put("url", url ?: "") }.toString()
        val eventDetails = JavaOnlyMap()
        eventDetails.putString("payload", json)
        val params = JavaOnlyArray()
        params.pushMap(eventDetails)
        val lynxContext = getLynxContext()
        if (lynxContext != null) {
            lynxContext.sendGlobalEvent("devclient:scanResult", params)
        } else {
            lynxViewRef?.sendGlobalEvent("devclient:scanResult", params)
        }
    }

    @LynxMethod
    fun reloadWithProjectBundle() {
        val launcher = reloadProjectLauncher
        val activity = hostActivity
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "reloadWithProjectBundle launcherPresent=${launcher != null} activity=${activity?.javaClass?.simpleName ?: "<none>"}")
        }
        if (launcher != null && activity != null) {
            activity.runOnUiThread { launcher.run() }
        } else {
            mContext.sendBroadcast(Intent(ACTION_RELOAD_PROJECT).setPackage(mContext.packageName))
        }
    }

    @LynxMethod
    fun openProjectDirect(bundleUrl: String) {
        val normalized = bundleUrl.trim().trimEnd('/')
        // Store the URL and open project
        prefs().edit().putString(KEY_URL, normalized).commit()
        mergeRecentImmediate(normalized)
        Thread {
            try {
                enrichRecentWithMeta(normalized)
            } catch (_: Exception) {
            }
        }.start()
        // Invoke the launcher to open ProjectActivity with the URL
        val activity = hostActivity
        val launcher = openProjectDirectLauncher
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "openProjectDirect normalized=$normalized launcherPresent=${launcher != null} activity=${activity?.javaClass?.simpleName ?: "<none>"}")
        }
        if (activity != null) {
            activity.runOnUiThread {
                launcher?.invoke(normalized)
            }
        } else {
            launcher?.invoke(normalized)
        }
    }

    @LynxMethod
    fun getProjectDeepLink(callback: Callback) {
        val devUrl = prefs().getString(KEY_URL, null)
        if (devUrl.isNullOrEmpty()) {
            callback.invoke("")
            return
        }
        val encodedUrl = java.net.URLEncoder.encode(devUrl, "UTF-8")
        val deepLink = "tamerdevapp://project?bundleUrl=$encodedUrl"
        callback.invoke(deepLink)
    }

    @LynxMethod
    fun startDiscovery() {
        val app = mContext.applicationContext
        if (nsdDiscovery != null) return
        nsdDiscovery = NsdDiscovery(
            app as android.app.Application,
            { url, meta -> isCompatibleWithOptionalMeta(url, meta) }
        ) { servers ->
            emitDiscoveredServers(servers)
        }
        nsdDiscovery?.start()
    }

    @LynxMethod
    fun stopDiscovery() {
        nsdDiscovery?.stop()
        nsdDiscovery = null
    }

    @LynxMethod
    fun getDiscoveredServers(callback: Callback) {
        val arr = JavaOnlyArray()
        for (s in lastDiscovered) {
            val map = JavaOnlyMap()
            map.putString("url", s.url)
            map.putString("name", s.name)
            map.putBoolean("compatible", s.compatible)
            if (s.iconUrl != null) map.putString("iconUrl", s.iconUrl)
            if (s.tamerAppKey != null) map.putString("tamerAppKey", s.tamerAppKey)
            arr.pushMap(map)
        }
        callback.invoke(arr)
    }

    @LynxMethod
    fun getAppInfo(callback: Callback) {
        val map = JavaOnlyMap()
        val prefs = prefs()

        // Try to read from cache first (set by launcher, shared with debug panel)
        var bundleId = prefs.getString("app_info_bundleId", null)
        var nativeAppVersion = prefs.getString("app_info_nativeAppVersion", null)
        var lynxSdkVersion = prefs.getString("app_info_lynxSdkVersion", null)

        // If not cached, read fresh and cache for next time
        if (bundleId == null || nativeAppVersion == null || lynxSdkVersion == null) {
            bundleId = mContext.packageName
            nativeAppVersion = ""
            try {
                val info = mContext.packageManager.getPackageInfo(mContext.packageName, 0)
                nativeAppVersion = info.versionName ?: ""
            } catch (_: Exception) {
            }
            lynxSdkVersion = BuildConfig.DECLARED_LYNX_SDK_VERSION

            // Cache for future calls
            prefs.edit().apply {
                putString("app_info_bundleId", bundleId)
                putString("app_info_nativeAppVersion", nativeAppVersion)
                putString("app_info_lynxSdkVersion", lynxSdkVersion)
                apply()
            }
        }

        map.putString("bundleId", bundleId ?: "")
        map.putString("nativeAppVersion", nativeAppVersion ?: "")
        map.putString("lynxSdkVersion", lynxSdkVersion ?: "")

        callback.invoke(map)
    }

    @LynxMethod
    fun getCurrentProjectDebugInfo(callback: Callback) {
        callback.invoke(buildCurrentProjectDebugInfoMap())
    }

    @LynxMethod
    fun checkServerCompatibility(baseUrl: String, callback: Callback) {
        Thread {
            val result = fetchMetaAndCheckCompatibility(baseUrl)
            val activity = hostActivity
            if (activity != null) {
                activity.runOnUiThread {
                    if (result == null) {
                        callback.invoke(true, JavaOnlyArray())
                    } else {
                        val requiredArr = JavaOnlyArray()
                        for ((pkg, cls) in result.requiredModules) {
                            val map = JavaOnlyMap()
                            map.putString("packageName", pkg)
                            map.putString("moduleClassName", cls)
                            requiredArr.pushMap(map)
                        }
                        callback.invoke(result.compatible, requiredArr)
                    }
                }
            } else {
                callback.invoke(true, JavaOnlyArray())
            }
        }.start()
    }

    @LynxMethod
    fun dismissTamerDebugPanel() {
        val a = hostActivity ?: (mContext as? LynxContext)?.activity as? Activity
        val run = Runnable { DevClientDebugPanel.dismiss() }
        if (a != null) {
            a.runOnUiThread(run)
        } else {
            run.run()
        }
    }
}
