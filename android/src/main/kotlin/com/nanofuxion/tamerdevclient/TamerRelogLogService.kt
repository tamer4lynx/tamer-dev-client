package com.nanofuxion.tamerdevclient

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.service.ILynxLogService
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

@Keep
object TamerRelogLogService : ILynxLogService {
    private const val PREFS = "tamer_dev_server"
    private const val KEY_URL = "dev_server_url"
    private const val MAX_QUEUE = 100
    private const val RECONNECT_DELAY_MS = 3000L

    @Volatile private var appContext: Context? = null
    @Volatile private var ws: WebSocket? = null
    @Volatile private var connecting = false
    @Volatile private var shouldReconnect = false
    private val pendingQueue = ArrayDeque<String>()
    private val handler = Handler(Looper.getMainLooper())

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private val consoleLogPattern = Pattern.compile(
        """\[.*?:(?:INFO|ERROR|WARN(?:ING)?|DEBUG|VERBOSE|FATAL):lynx_console\.cc\(\d+\)] (.+)""",
        Pattern.DOTALL
    )

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun connect() {
        shouldReconnect = true
        if (connecting || ws != null) return
        val ctx = appContext ?: return
        val devUrl = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_URL, null) ?: return
        val wsUrl = buildWsUrl(devUrl) ?: return
        connecting = true
        val request = Request.Builder().url(wsUrl).build()
        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(socket: WebSocket, response: okhttp3.Response) {
                ws = socket
                connecting = false
                val ping = JSONObject().apply {
                    put("type", "console_log")
                    put("tag", "lynx-console")
                    put("message", JSONArray().put("[TamerRelog] connected"))
                }.toString()
                socket.send(ping)
                synchronized(pendingQueue) {
                    while (pendingQueue.isNotEmpty()) {
                        socket.send(pendingQueue.removeFirst())
                    }
                }
            }
            override fun onFailure(socket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                ws = null
                connecting = false
                synchronized(pendingQueue) { pendingQueue.clear() }
                scheduleReconnect()
            }
            override fun onClosed(socket: WebSocket, code: Int, reason: String) {
                ws = null
                connecting = false
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        handler.postDelayed({ connect() }, RECONNECT_DELAY_MS)
    }

    fun disconnect() {
        shouldReconnect = false
        handler.removeCallbacksAndMessages(null)
        ws?.close(1000, null)
        ws = null
        connecting = false
        synchronized(pendingQueue) { pendingQueue.clear() }
    }

    override fun logByPlatform(level: Int, tag: String, msg: String) {
        LynxLogService.logByPlatform(level, tag, msg)

        val (forwardTag, forwardMsg) = if (tag == "lynx") {
            val m = consoleLogPattern.matcher(msg)
            if (m.find()) "lynx-console" to m.group(1)!! else tag to msg
        } else {
            tag to msg
        }

        val payload = try {
            JSONObject().apply {
                put("type", "console_log")
                put("tag", forwardTag)
                put("message", JSONArray().put(forwardMsg))
            }.toString()
        } catch (_: Exception) { return }

        val socket = ws
        if (socket != null) {
            socket.send(payload)
        } else if (connecting) {
            synchronized(pendingQueue) {
                if (pendingQueue.size < MAX_QUEUE) pendingQueue.addLast(payload)
            }
        }
    }

    private fun buildWsUrl(devUrl: String): String? {
        val uri = Uri.parse(devUrl)
        val scheme = if (uri.scheme == "https") "wss" else "ws"
        val host = uri.host ?: return null
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
        return "$scheme://$host$port$path"
    }

    override fun isLogOutputByPlatform(): Boolean = true
    override fun getDefaultWriteFunction(): Long = 0
    override fun switchLogToSystem(enableSystemLog: Boolean) {}
    override fun getLogToSystemStatus(): Boolean = false
}
