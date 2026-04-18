package com.nanofuxion.tamerdevclient

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.Choreographer
import java.io.File
import java.io.RandomAccessFile

object PerfSampler {
    data class Sample(
        val t: Long,
        val frametimeMs: Double,
        val cpuPct: Double,
        val gpuPct: Double,
    )

    private const val SAMPLE_INTERVAL_MS = 1000L
    private const val RING_CAPACITY = 120
    private const val CLK_TCK_FALLBACK = 100L

    @Volatile private var started = false
    private var samplerThread: HandlerThread? = null
    private var handler: Handler? = null

    private var lastFrameTimeNanos: Long = 0L
    @Volatile private var maxFrameDeltaNs: Long = 0L

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            val last = lastFrameTimeNanos
            if (last != 0L) {
                val delta = frameTimeNanos - last
                if (delta > 0 && delta > maxFrameDeltaNs) {
                    maxFrameDeltaNs = delta
                }
            }
            lastFrameTimeNanos = frameTimeNanos
            try {
                Choreographer.getInstance().postFrameCallback(this)
            } catch (_: Throwable) {
            }
        }
    }

    private var lastCpuTicks: Long = -1L
    private var lastCpuWallMs: Long = -1L
    private val cores: Int = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
    private val clkTck: Long = readClkTck()

    private val ring = ArrayDeque<Sample>(RING_CAPACITY)
    private val ringLock = Any()

    @Volatile private var listener: ((Sample) -> Unit)? = null

    fun ensureStarted(context: Context) {
        if (started) return
        synchronized(this) {
            if (started) return
            started = true
            val thread = HandlerThread("TamerPerfSampler")
            thread.start()
            samplerThread = thread
            handler = Handler(thread.looper)

            Handler(context.mainLooper).post {
                try {
                    Choreographer.getInstance().postFrameCallback(frameCallback)
                } catch (_: Throwable) {
                }
            }

            scheduleTick()
        }
    }

    fun setListener(cb: ((Sample) -> Unit)?) {
        listener = cb
    }

    fun snapshot(): List<Sample> {
        synchronized(ringLock) {
            return ring.toList()
        }
    }

    private fun scheduleTick() {
        handler?.postDelayed({ tick() }, SAMPLE_INTERVAL_MS)
    }

    private fun tick() {
        try {
            val frametimeMs = consumeMaxFrameDeltaMs()
            val cpuPct = readCpuPercent()
            val gpuPct = readGpuPercent()
            val s = Sample(
                t = System.currentTimeMillis(),
                frametimeMs = frametimeMs,
                cpuPct = cpuPct,
                gpuPct = gpuPct,
            )
            synchronized(ringLock) {
                if (ring.size >= RING_CAPACITY) ring.removeFirst()
                ring.addLast(s)
            }
            listener?.invoke(s)
        } catch (_: Throwable) {
        } finally {
            scheduleTick()
        }
    }

    private fun consumeMaxFrameDeltaMs(): Double {
        val maxNs = maxFrameDeltaNs
        maxFrameDeltaNs = 0L
        if (maxNs <= 0) return 0.0
        return maxNs / 1_000_000.0
    }

    private fun readCpuPercent(): Double {
        val ticks = readProcSelfStatTicks() ?: return -1.0
        val now = SystemClock.elapsedRealtime()
        val prevTicks = lastCpuTicks
        val prevWall = lastCpuWallMs
        lastCpuTicks = ticks
        lastCpuWallMs = now
        if (prevTicks < 0 || prevWall < 0) return 0.0
        val deltaTicks = (ticks - prevTicks).coerceAtLeast(0)
        val deltaWallMs = (now - prevWall).coerceAtLeast(1)
        val wallTicks = (deltaWallMs * clkTck) / 1000.0
        if (wallTicks <= 0) return 0.0
        val pct = (deltaTicks / (wallTicks * cores)) * 100.0
        return pct.coerceIn(0.0, 100.0)
    }

    private fun readProcSelfStatTicks(): Long? {
        return try {
            RandomAccessFile("/proc/self/stat", "r").use { f ->
                val line = f.readLine() ?: return null
                val lastParen = line.lastIndexOf(')')
                if (lastParen < 0) return null
                val tail = line.substring(lastParen + 1).trim()
                val parts = tail.split(' ')
                // After comm, parts[0]=state; utime is parts[11], stime is parts[12]
                if (parts.size < 13) return null
                val utime = parts[11].toLongOrNull() ?: return null
                val stime = parts[12].toLongOrNull() ?: return null
                utime + stime
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun readClkTck(): Long {
        return try {
            val cls = Class.forName("android.system.Os")
            val sysconf = cls.getMethod("sysconf", Int::class.javaPrimitiveType)
            val scClkTckField = cls.getField("_SC_CLK_TCK")
            val v = sysconf.invoke(null, scClkTckField.getInt(null)) as Long
            if (v > 0) v else CLK_TCK_FALLBACK
        } catch (_: Throwable) {
            CLK_TCK_FALLBACK
        }
    }

    private var gpuProbe: GpuProbe? = null
    @Volatile private var gpuProbeResolved: Boolean = false

    private sealed class GpuProbe {
        abstract fun read(): Double
        class Adreno3dPercent(val path: String) : GpuProbe() {
            override fun read(): Double {
                return readFirstDouble(path)?.coerceIn(0.0, 100.0) ?: -1.0
            }
        }
        class AdrenoBusyFrac(val path: String) : GpuProbe() {
            override fun read(): Double {
                return try {
                    val txt = File(path).readText().trim()
                    val tokens = txt.split(Regex("\\s+"))
                    if (tokens.size < 2) return -1.0
                    val busy = tokens[0].toDoubleOrNull() ?: return -1.0
                    val total = tokens[1].toDoubleOrNull() ?: return -1.0
                    if (total <= 0) return -1.0
                    ((busy / total) * 100.0).coerceIn(0.0, 100.0)
                } catch (_: Throwable) { -1.0 }
            }
        }
        class MaliUtilization(val path: String) : GpuProbe() {
            override fun read(): Double {
                return readFirstDouble(path)?.coerceIn(0.0, 100.0) ?: -1.0
            }
        }
    }

    private fun readFirstDouble(path: String): Double? {
        return try {
            val txt = File(path).readText().trim()
            val first = txt.split(Regex("\\s+")).firstOrNull() ?: return null
            first.toDoubleOrNull()
        } catch (_: Throwable) {
            null
        }
    }

    private fun resolveGpuProbe(): GpuProbe? {
        val adreno = "/sys/kernel/debug/kgsl/kgsl-3d0/gpu_busy_percentage"
        if (File(adreno).canRead()) return GpuProbe.Adreno3dPercent(adreno)
        val adrenoBusy = "/sys/class/kgsl/kgsl-3d0/gpubusy"
        if (File(adrenoBusy).canRead()) return GpuProbe.AdrenoBusyFrac(adrenoBusy)
        try {
            val platform = File("/sys/devices/platform")
            if (platform.isDirectory) {
                val mali = platform.listFiles()?.firstOrNull { it.name.endsWith(".mali") }
                if (mali != null) {
                    val util = File(mali, "utilization")
                    if (util.canRead()) return GpuProbe.MaliUtilization(util.absolutePath)
                }
            }
        } catch (_: Throwable) {
        }
        return null
    }

    private fun readGpuPercent(): Double {
        if (!gpuProbeResolved) {
            gpuProbe = resolveGpuProbe()
            gpuProbeResolved = true
        }
        val probe = gpuProbe ?: return -1.0
        return probe.read()
    }
}
