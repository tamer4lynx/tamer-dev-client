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
    fun bootstrapDevToolForProjectHost(context: Context) {
        configure(context)
        enableLynxDebugFlags()
    }

    @JvmStatic
    fun configure(context: Context) {
        if (!BuildConfig.DEBUG) return
        disableLongPressMenuIfAvailable(context)
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

    /**
     * Disables the stock Lynx long-press "Lynx Debug Menu" so hosts can use shake + custom UI instead.
     * Uses [com.lynx.devtool.LynxDevtoolEnv] on current Lynx SDKs; falls back to legacy DevToolSettings if present.
     */
    @JvmStatic
    @JvmOverloads
    fun disableLongPressMenuIfAvailable(context: Context? = null) {
        if (!BuildConfig.DEBUG) return
        try {
            val envCls = Class.forName("com.lynx.devtool.LynxDevtoolEnv")
            val inst = envCls.getMethod("inst").invoke(null)
            val appCtx = context?.applicationContext
            if (appCtx != null) {
                try {
                    envCls.getMethod("init", Context::class.java).invoke(inst, appCtx)
                } catch (_: Throwable) {
                }
            }
            envCls.getMethod("enableLongPressMenu", java.lang.Boolean.TYPE).invoke(inst, false)
        } catch (_: Throwable) {
            try {
                val cls = Class.forName("com.lynx.devtoolwrapper.DevToolSettings")
                val inst = cls.getMethod("inst").invoke(null)
                cls.getMethod("setLongPressMenuEnabled", java.lang.Boolean.TYPE)
                    .invoke(inst, false)
            } catch (_: Throwable) {
            }
        }
    }
}
