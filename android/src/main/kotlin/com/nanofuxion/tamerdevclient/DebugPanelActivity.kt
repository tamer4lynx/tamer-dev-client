package com.nanofuxion.tamerdevclient

import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.provider.AbsTemplateProvider

class DebugPanelActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "DebugPanelActivity"
    }

    private var lynxView: LynxView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LynxDevToolBootstrap.bootstrapDevToolForProjectHost(this)
        registerGeneratedLynxExtensions()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = true

        DevClientDebugPanel.trackPanelActivity(this)
        DevClientModule.attachHostActivity(this)

        lynxView = buildLynxView()
        setContentView(lynxView)
        DevClientModule.attachLynxView(lynxView)
        notifyGeneratedHostViewChanged(lynxView)
        lynxView?.renderTemplateUrl(DevClientDebugPanel.TAMER_DEBUG_BUNDLE, "")
    }

    override fun onDestroy() {
        DevClientDebugPanel.trackPanelActivity(null)
        DevClientModule.attachHostActivity(null)
        DevClientModule.attachLynxView(null)
        notifyGeneratedHostViewChanged(null)
        lynxView?.destroy()
        lynxView = null
        super.onDestroy()
    }

    private fun buildLynxView(): LynxView {
        val dm = resources.displayMetrics
        val w = dm.widthPixels
        val h = dm.heightPixels
        val viewBuilder = LynxViewBuilder()
        viewBuilder.setScreenSize(w, h)
        viewBuilder.setFontScale(1f)
        val wSpec = View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY)
        val hSpec = View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
        viewBuilder.setPresetMeasuredSpec(wSpec, hSpec)
        // packageName returns the host app's application ID, not the library's package.
        val pkg = packageName
        try {
            val providerCls = Class.forName("$pkg.TemplateProvider")
            val provider = providerCls.getConstructor(android.content.Context::class.java).newInstance(this)
            val setMethod = LynxViewBuilder::class.java.getMethod("setTemplateProvider", AbsTemplateProvider::class.java)
            setMethod.invoke(viewBuilder, provider)
        } catch (e: Exception) {
            Log.e(TAG, "Could not set TemplateProvider", e)
        }
        try {
            val genCls = Class.forName("$pkg.generated.GeneratedLynxExtensions")
            val instance = genCls.getField("INSTANCE").get(null)
            genCls.getMethod("configureViewBuilder", LynxViewBuilder::class.java).invoke(instance, viewBuilder)
        } catch (e: Exception) {
            Log.e(TAG, "configureViewBuilder failed", e)
        }
        viewBuilder.registerModule("DevClientModule", DevClientModule::class.java)
        return viewBuilder.build(this)
    }

    private fun registerGeneratedLynxExtensions() {
        try {
            val registerCls = Class.forName("$packageName.generated.GeneratedLynxExtensions")
            val instance = registerCls.getField("INSTANCE").get(null)
            registerCls.getMethod("register", android.content.Context::class.java).invoke(instance, this)
        } catch (e: Exception) {
            Log.e(TAG, "GeneratedLynxExtensions.register failed", e)
        }
    }

    private fun notifyGeneratedHostViewChanged(view: View?) {
        try {
            val registerCls = Class.forName("$packageName.generated.GeneratedLynxExtensions")
            val instance = registerCls.getField("INSTANCE").get(null)
            registerCls.getMethod("onHostViewChanged", View::class.java).invoke(instance, view)
        } catch (e: Exception) {
            Log.e(TAG, "GeneratedLynxExtensions.onHostViewChanged failed", e)
        }
    }
}
