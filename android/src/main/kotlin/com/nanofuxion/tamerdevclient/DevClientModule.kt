package com.nanofuxion.tamerdevclient

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.zxing.integration.android.IntentIntegrator
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.LynxView
import com.lynx.tasm.behavior.LynxContext
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
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PROJECT_INIT_DATA, "{}") ?: "{}"
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
        }

        fun attachLynxView(view: LynxView?) {
            lynxViewRef = view
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
    }

    private var nsdDiscovery: NsdDiscovery? = null
    private var lastDiscovered: List<DiscoveredServer> = emptyList()

    data class CompatibilityResult(val compatible: Boolean, val requiredModules: List<Pair<String, String>>)

    private fun fetchMetaJSONObject(baseUrl: String): JSONObject? {
        return try {
            val metaUrl = baseUrl.trimEnd('/') + "/meta.json"
            val request = okhttp3.Request.Builder().url(metaUrl).build()
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
        val json = fetchMetaJSONObject(baseUrl) ?: return if (supported.isEmpty()) CompatibilityResult(true, emptyList()) else null
        return compatibilityFromMeta(json, supported)
    }

    private fun isCompatibleWithOptionalMeta(baseUrl: String, meta: JSONObject?): Boolean {
        val supported = DevClientModule.getSupportedModuleClassNames()
        val json = meta ?: fetchMetaJSONObject(baseUrl) ?: return true
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

    @LynxMethod
    fun getDevServerUrl(callback: Callback) {
        callback.invoke(prefs().getString(KEY_URL, null) ?: "")
    }

    @LynxMethod
    fun setDevServerUrl(url: String) {
        val normalized = url.trim().removeSuffix("/").let { u ->
            when {
                u.endsWith("/main.lynx.bundle") -> u.removeSuffix("/main.lynx.bundle")
                u.endsWith("main.lynx.bundle") -> u.removeSuffix("main.lynx.bundle").trimEnd('/')
                else -> u
            }
        }
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

    private fun buildProjectInitDataJson(meta: JSONObject?): String {
        if (meta == null) return "{}"
        val o = JSONObject()
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
        prefs().edit().putString(KEY_PROJECT_INIT_DATA, buildProjectInitDataJson(meta)).apply()
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
        if (launcher != null && activity != null) {
            activity.runOnUiThread { launcher.run() }
        } else {
            mContext.sendBroadcast(Intent(ACTION_RELOAD_PROJECT).setPackage(mContext.packageName))
        }
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
}
