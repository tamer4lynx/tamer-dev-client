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
import org.json.JSONObject

class DevClientModule(context: Context) : LynxModule(context) {

    companion object {
        private const val TAG = "DevClientModule"
        const val ACTION_RELOAD_PROJECT = "com.tamer4lynx.RELOAD_PROJECT"
        private const val PREFS = "tamer_dev_server"
        private const val KEY_URL = "dev_server_url"
        private const val KEY_RECENT = "dev_server_recent"

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

    private fun fetchMetaAndCheckCompatibility(baseUrl: String): CompatibilityResult? {
        val supported = DevClientModule.getSupportedModuleClassNames()
        if (supported.isEmpty()) return CompatibilityResult(true, emptyList())
        return try {
            val metaUrl = baseUrl.trimEnd('/') + "/meta.json"
            val request = okhttp3.Request.Builder().url(metaUrl).build()
            val client = okhttp3.OkHttpClient.Builder()
                .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful || response.body == null) return null
            val body = response.body!!.string()
            val json = org.json.JSONObject(body)
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
            CompatibilityResult(required.isEmpty(), required)
        } catch (_: Exception) {
            null
        }
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
        addRecent(normalized)
    }

    private fun addRecent(url: String) {
        val current = parseRecentJson().filter { it != url }
        val updated = listOf(url) + current
        prefs().edit()
            .putString(KEY_RECENT, org.json.JSONArray(updated.take(10)).toString())
            .apply()
    }

    private fun parseRecentJson(): List<String> {
        val json = prefs().getString(KEY_RECENT, "[]") ?: "[]"
        return try {
            val ja = org.json.JSONArray(json)
            (0 until ja.length()).map { ja.getString(it) }
        } catch (_: Exception) { emptyList() }
    }

    @LynxMethod
    fun getRecentUrls(callback: Callback) {
        val arr = JavaOnlyArray()
        for (s in parseRecentJson()) arr.pushString(s)
        callback.invoke(arr)
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
            { url -> fetchMetaAndCheckCompatibility(url)?.let { it.compatible } ?: true }
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
