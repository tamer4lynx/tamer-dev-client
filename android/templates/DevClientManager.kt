package {{PACKAGE_NAME}}

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class DevClientManager(private val context: Context, private val onReload: Runnable) {
    private var webSocket: WebSocket? = null
    private var shouldReconnect = false
    private val handler = Handler(Looper.getMainLooper())
    private val reconnectDelayMs = 3000L
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(0, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    fun connect() {
        shouldReconnect = true
        connectInternal()
    }

    private fun connectInternal() {
        if (webSocket != null) return
        val devUrl = DevServerPrefs.getUrl(context) ?: return
        val uri = Uri.parse(devUrl)
        val scheme = if (uri.scheme == "https") "wss" else "ws"
        val host = uri.host ?: return
        val port = if (uri.port > 0) ":${uri.port}" else ""
        var rawPath = uri.path ?: ""
        if (!rawPath.startsWith("/")) rawPath = "/$rawPath"
        rawPath = rawPath.trimEnd('/')
        if (rawPath.lowercase().endsWith(".lynx.bundle")) {
            val i = rawPath.lastIndexOf('/')
            rawPath = if (i > 0) rawPath.substring(0, i) else ""
        }
        if (rawPath.isEmpty()) rawPath = "/"
        val dir = if (rawPath.endsWith("/")) rawPath else "$rawPath/"
        val path = "${dir}__hmr"
        val wsUrl = "$scheme://$host$port$path"
        val request = Request.Builder()
            .url(wsUrl)
            .build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    if (text.contains("\"type\":\"reload\"")) {
                        handler.post(onReload)
                    }
                } catch (_: Exception) { }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                clearSocket()
                scheduleReconnect()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                clearSocket()
                scheduleReconnect()
            }
        })
    }

    private fun clearSocket() {
        webSocket = null
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        handler.postDelayed({ connectInternal() }, reconnectDelayMs)
    }

    fun disconnect() {
        shouldReconnect = false
        handler.removeCallbacksAndMessages(null)
        webSocket?.close(1000, null)
        webSocket = null
    }
}
