package com.nanofuxion.tamerdevclient

import android.app.Activity
import android.content.Intent
import android.util.Log

object DevClientDebugPanel {
    const val TAMER_DEBUG_BUNDLE = "tamer-debug.lynx.bundle"

    @Volatile
    private var panelActivity: Activity? = null

    fun trackPanelActivity(activity: Activity?) {
        panelActivity = activity
    }

    @JvmStatic
    fun dismiss() {
        val a = panelActivity ?: return
        panelActivity = null
        try {
            if (!a.isFinishing && !a.isDestroyed) {
                a.runOnUiThread { a.finish() }
            }
        } catch (e: Exception) {
            Log.w("DevClientDebugPanel", "dismiss: ${e.message}")
        }
    }

    @JvmStatic
    fun show(activity: Activity) {
        if (panelActivity != null) return
        try {
            if (activity.isFinishing || activity.isDestroyed) return
            activity.startActivity(Intent(activity, DebugPanelActivity::class.java))
        } catch (e: Exception) {
            Log.e("DevClientDebugPanel", "show failed", e)
        }
    }
}
