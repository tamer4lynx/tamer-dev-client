package com.nanofuxion.tamerdevclient

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.Choreographer
import java.io.RandomAccessFile

object PerfSampler {
    data class Sample(
        val t: Long,
        val frametimeMs: Double,
        val cpuPct: Double,
        val avgFps: Int,
    )

    private const val SAMPLE_INTERVAL_MS = 1000L
    private const val RING_CAPACITY = 120
    private const val CLK_TCK_FALLBACK = 100L

    @Volatile private var wired = false
    @Volatile private var active = false
    @Volatile private var tickScheduled = false
    private var samplerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var appContext: Context? = null

    private var lastFrameTimeNanos: Long = 0L
    @Volatile private var frameCount: Int = 0
    @Volatile private var totalFrameDeltaNs: Long = 0L

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!active) {
                lastFrameTimeNanos = 0L
                return
            }
            val last = lastFrameTimeNanos
            if (last != 0L) {
                val delta = frameTimeNanos - last
                if (delta > 0) {
                    frameCount++
                    totalFrameDeltaNs += delta
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
        if (wired) return
        synchronized(this) {
            if (wired) return
            wired = true
            appContext = context.applicationContext
            val thread = HandlerThread("TamerPerfSampler")
            thread.start()
            samplerThread = thread
            handler = Handler(thread.looper)
        }
    }

    /// Gate sampling to project Activity foreground.
    fun setActive(shouldBeActive: Boolean) {
        synchronized(this) {
            if (active == shouldBeActive) return
            active = shouldBeActive
            if (shouldBeActive) {
                lastFrameTimeNanos = 0L
                frameCount = 0
                totalFrameDeltaNs = 0L
                lastCpuTicks = -1L
                lastCpuWallMs = -1L
                val ctx = appContext
                if (ctx != null) {
                    Handler(ctx.mainLooper).post {
                        try {
                            Choreographer.getInstance().postFrameCallback(frameCallback)
                        } catch (_: Throwable) {
                        }
                    }
                }
                if (!tickScheduled) {
                    tickScheduled = true
                    scheduleTick()
                }
            } else {
                synchronized(ringLock) { ring.clear() }
            }
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
        if (!active) {
            tickScheduled = false
            return
        }
        try {
            val (fps, avgMs) = consumeFrameStats()
            val cpuPct = readCpuPercent()
            val s = Sample(
                t = System.currentTimeMillis(),
                frametimeMs = avgMs,
                cpuPct = cpuPct,
                avgFps = fps,
            )
            synchronized(ringLock) {
                if (ring.size >= RING_CAPACITY) ring.removeFirst()
                ring.addLast(s)
            }
            listener?.invoke(s)
        } catch (_: Throwable) {
        } finally {
            if (active) {
                scheduleTick()
            } else {
                tickScheduled = false
            }
        }
    }

    private fun consumeFrameStats(): Pair<Int, Double> {
        val count = frameCount
        val totalNs = totalFrameDeltaNs
        frameCount = 0
        totalFrameDeltaNs = 0L
        val avgMs = if (count > 0) totalNs / 1_000_000.0 / count else 0.0
        return Pair(count, avgMs)
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
}
