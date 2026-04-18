package com.nanofuxion.tamerdevclient.nsd

import android.app.Application
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private const val SERVICE_TYPE = "_tamer._tcp."
private const val TAG = "NsdDiscovery"

data class DiscoveredServer(
    val url: String,
    val name: String,
    val compatible: Boolean = true,
    val iconUrl: String? = null,
    val tamerAppKey: String? = null,
)

class NsdDiscovery(
    application: Application,
    private val isCompatible: (String, JSONObject?) -> Boolean = { _, _ -> true },
    private val onServersChanged: (List<DiscoveredServer>) -> Unit
) {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val nsdManager = application.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private var isDiscovering = false
    private var healthCheckJob: Job? = null
    private val potentialServers = mutableSetOf<PotentialServer>()

    private data class PotentialServer(val serviceName: String, val url: String, val name: String)

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {}
        override fun onServiceFound(service: NsdServiceInfo) {
            scope.launch { resolveAndAdd(service) }
        }

        override fun onServiceLost(service: NsdServiceInfo) {
            val name = service.serviceName ?: return
            synchronized(potentialServers) {
                potentialServers.removeAll { it.serviceName == name }
            }
        }

        override fun onDiscoveryStopped(serviceType: String) {
            synchronized(potentialServers) { potentialServers.clear() }
            onServersChanged(emptyList())
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "Discovery start failed: $errorCode")
            isDiscovering = false
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "Discovery stop failed: $errorCode")
        }
    }

    fun start() {
        if (nsdManager == null) {
            Log.e(TAG, "NsdManager not available")
            return
        }
        if (isDiscovering) return
        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        isDiscovering = true
        startHealthCheck()
    }

    fun stop() {
        if (!isDiscovering) return
        nsdManager?.stopServiceDiscovery(discoveryListener)
        isDiscovering = false
        healthCheckJob?.cancel()
        healthCheckJob = null
        synchronized(potentialServers) { potentialServers.clear() }
        onServersChanged(emptyList())
    }

    private suspend fun resolveAndAdd(serviceInfo: NsdServiceInfo) {
        if (nsdManager == null) return
        try {
            val resolved = nsdManager.resolveServiceCoroutine(serviceInfo)
            scope.ensureActive()
            val baseUrl = resolved.getUrl() ?: return
            val path = resolved.getAttribute("path") ?: ""
            val url = baseUrl.trimEnd('/') + path
            val name = resolved.getAttribute("name") ?: resolved.serviceName ?: url
            synchronized(potentialServers) {
                potentialServers.add(PotentialServer(resolved.serviceName ?: "", url, name))
            }
        } catch (e: Exception) {
            Log.w(TAG, "Resolve failed: ${e.message}")
        }
    }

    private fun startHealthCheck() {
        healthCheckJob?.cancel()
        healthCheckJob = scope.launch {
            while (isActive && isDiscovering) {
                val current = synchronized(potentialServers) { potentialServers.toList() }
                val alive = current
                    .map { s ->
                        async {
                            if (!checkStatus(s.url)) null
                            else {
                                val meta = fetchMeta(s.url)
                                val displayName =
                                    meta?.optString("name")?.takeIf { it.isNotBlank() } ?: s.name
                                DiscoveredServer(
                                    url = s.url,
                                    name = displayName,
                                    compatible = isCompatible(s.url, meta),
                                    iconUrl = meta?.optString("icon")?.takeIf { it.isNotBlank() },
                                    tamerAppKey = meta?.optString("tamerAppKey")?.takeIf { it.isNotBlank() },
                                )
                            }
                        }
                    }
                    .awaitAll()
                    .filterNotNull()
                ensureActive()
                onServersChanged(alive)
                delay(3000)
            }
        }
    }

    private fun checkStatus(url: String): Boolean {
        return try {
            val statusUrl = url.trimEnd('/') + "/status"
            val request = Request.Builder()
                .url(statusUrl)
                .header("x-tamer-probe", "discovery-status")
                .build()
            val response = httpClient.newCall(request).execute()
            response.isSuccessful && (response.body?.string()?.contains("packager-status:running") == true)
        } catch (_: Exception) {
            false
        }
    }

    private fun fetchMeta(url: String): JSONObject? {
        return try {
            val metaUrl = url.trimEnd('/') + "/meta.json"
            val request = Request.Builder()
                .url(metaUrl)
                .header("x-tamer-probe", "discovery-meta")
                .build()
            val response = httpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            val body = response.body?.string() ?: return null
            JSONObject(body)
        } catch (_: Exception) {
            null
        }
    }
}
