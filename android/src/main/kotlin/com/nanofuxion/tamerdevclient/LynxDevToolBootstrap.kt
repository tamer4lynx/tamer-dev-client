package com.nanofuxion.tamerdevclient

import android.app.Application
import android.content.Context
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.ILynxDevToolService
import com.lynx.tasm.service.LynxServiceCenter
import java.util.concurrent.atomic.AtomicBoolean

object LynxDevToolBootstrap {
    private val configured = AtomicBoolean(false)
    private val flagsEnabled = AtomicBoolean(false)

    @JvmStatic
    fun configure(context: Context) {
        if (!BuildConfig.DEBUG) return
        if (!configured.compareAndSet(false, true)) return
        val app = context.applicationContext as? Application ?: return
        try {
            val devTool =
                Class.forName("com.lynx.service.devtool.LynxDevToolService")
                    .getMethod("getINSTANCE")
                    .invoke(null) as ILynxDevToolService
            LynxServiceCenter.inst().registerService(devTool)
            LynxEnv.inst().init(app, null, null, null)
        } catch (_: Throwable) {
        }
    }

    @JvmStatic
    fun enableLynxDebugFlags() {
        if (!BuildConfig.DEBUG) return
        if (!flagsEnabled.compareAndSet(false, true)) return
        try {
            LynxEnv.inst().enableLynxDebug(true)
            LynxEnv.inst().enableDevtool(true)
            LynxEnv.inst().enableLogBox(true)
        } catch (_: Throwable) {
        }
    }
}
