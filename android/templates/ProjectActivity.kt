package {{PACKAGE_NAME}}

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.lynx.tasm.LynxBooleanOption
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import {{PACKAGE_NAME}}.DevClientManager
import {{PACKAGE_NAME}}.generated.GeneratedLynxExtensions
import {{PACKAGE_NAME}}.generated.GeneratedActivityLifecycle
import com.nanofuxion.tamerdevclient.DevClientDebugPanel
import com.nanofuxion.tamerdevclient.DevClientModule
import com.nanofuxion.tamerinsets.TamerInsetsModule
import com.nanofuxion.tamernavigation.stack.TamerNavHost
import {{PACKAGE_NAME}}.DevServerPrefs

class ProjectActivity : AppCompatActivity() {
    private var lynxView: LynxView? = null
    private var devClientManager: DevClientManager? = null
    private var activeProjectUrl: String? = null
    private val handler = Handler(Looper.getMainLooper())
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            GeneratedActivityLifecycle.onBackPressed { consumed ->
                if (!consumed) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }
    }

    private fun bindProjectCallbacks() {
        DevClientModule.attachHostActivity(this)
        DevClientModule.attachLynxView(lynxView)
        DevClientModule.attachReloadProjectLauncher { reloadProjectView() }
        DevClientModule.attachOpenProjectDirectLauncher { bundleUrl ->
            handleProjectOpenIntent(Intent().putExtra("bundleUrl", bundleUrl))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.nanofuxion.tamerdevclient.LynxDevToolBootstrap.bootstrapDevToolForProjectHost(this)
        GeneratedLynxExtensions.register(this)
        configureTamerNavSpokeBuilder()
        GeneratedActivityLifecycle.onCreate(intent)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = true
        lynxView = buildLynxView()
        setContentView(lynxView)
        GeneratedActivityLifecycle.onViewAttached(lynxView)
        GeneratedLynxExtensions.onHostViewChanged(lynxView)
        lynxView?.renderTemplateUrl(projectTemplateKey(), projectInitDataWithInsetsSnapshot(this))
        bindProjectCallbacks()
        activeProjectUrl = DevServerPrefs.getUrl(this)?.trim()
        devClientManager = DevClientManager(this) { reloadProjectView() }
        devClientManager?.connect()
        GeneratedActivityLifecycle.onCreateDelayed(handler)
        onBackPressedDispatcher.addCallback(this, backCallback)
    }

    private fun reloadProjectView() {
        activeProjectUrl = DevServerPrefs.getUrl(this)?.trim()
        devClientManager?.disconnect()
        GeneratedActivityLifecycle.onViewDetached()
        GeneratedLynxExtensions.onHostViewChanged(null)
        lynxView?.destroy()

        val nextView = buildLynxView()
        lynxView = nextView
        setContentView(nextView)
        GeneratedActivityLifecycle.onViewAttached(nextView)
        GeneratedLynxExtensions.onHostViewChanged(nextView)
        nextView.renderTemplateUrl(projectTemplateKey(), projectInitDataWithInsetsSnapshot(this))
        DevClientModule.attachLynxView(nextView)
        GeneratedActivityLifecycle.onCreateDelayed(handler)
        devClientManager?.connect()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        GeneratedActivityLifecycle.onWindowFocusChanged(hasFocus)
    }

    override fun onResume() {
        super.onResume()
        DevClientModule.setProjectActive(true)
        DevClientModule.startShakeDetection(this) { DevClientDebugPanel.show(this) }
        bindProjectCallbacks()
        val savedUrl = DevServerPrefs.getUrl(this)?.trim()
        if (!savedUrl.isNullOrBlank() && savedUrl != activeProjectUrl) {
            reloadProjectView()
        }
        GeneratedActivityLifecycle.onResume()
    }

    override fun onPause() {
        DevClientModule.stopShakeDetection()
        super.onPause()
        GeneratedActivityLifecycle.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        GeneratedActivityLifecycle.onNewIntent(intent)
        handleProjectOpenIntent(intent)
    }

    private fun handleProjectOpenIntent(intent: Intent) {
        val newUrl = intent.getStringExtra("bundleUrl")
            ?: intent.data?.getQueryParameter("bundleUrl")
            ?: return
        if (newUrl.isBlank()) return
        DevServerPrefs.setUrl(this, newUrl.trim())
        reloadProjectView()
    }

    override fun onDestroy() {
        DevClientModule.setProjectActive(false)
        TamerNavHost.spokeTemplateSrcNormalizer = null
        DevClientModule.attachHostActivity(null)
        DevClientModule.attachLynxView(null)
        DevClientModule.attachReloadProjectLauncher(null)
        DevClientModule.attachOpenProjectDirectLauncher(null)
        GeneratedActivityLifecycle.onViewDetached()
        GeneratedLynxExtensions.onHostViewChanged(null)
        lynxView?.destroy()
        lynxView = null
        devClientManager?.disconnect()
        super.onDestroy()
    }

    /** Merges the cached safe-area insets into project init data so the JS bundle's
     * first React render reads real insets via `lynx.__initData.__tamerInsetsSnapshot`
     * instead of starting at zero and snapping when `tamer-insets:change` lands. */
    private fun projectTemplateKey(): String = DevServerPrefs.projectLynxTemplateKey(this)

    private fun projectInitDataWithInsetsSnapshot(ctx: android.content.Context): String {
        val baseJson = DevClientModule.getProjectInitDataJson(ctx)
        val snapshot = TamerInsetsModule.currentInsetsSnapshotJson() ?: return baseJson
        val trimmed = baseJson.trim()
        val injection = "\"__tamerInsetsSnapshot\":$snapshot"
        return when {
            trimmed.isEmpty() || trimmed == "{}" -> "{$injection}"
            trimmed.startsWith("{") && trimmed.endsWith("}") -> {
                val inner = trimmed.substring(1, trimmed.length - 1).trim()
                if (inner.isEmpty()) "{$injection}" else "{$injection,$inner}"
            }
            else -> baseJson
        }
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()
        TamerNavLynxRuntime.configureBuilder(this, viewBuilder, projectTemplateKey())
        GeneratedLynxExtensions.configureViewBuilder(viewBuilder)
        return viewBuilder.build(this)
    }

    private fun configureTamerNavSpokeBuilder() {
        TamerNavHost.configureSharedLynxGroup(TamerNavLynxRuntime.group)
        TamerNavHost.spokeTemplateSrcNormalizer = { ctx, s ->
            if (s.isBlank() || s.equals("main.lynx.bundle", ignoreCase = true)) {
                DevServerPrefs.projectLynxTemplateKey(ctx)
            } else {
                s
            }
        }
        TamerNavHost.sourceSpokeBuilder = { ctx, src ->
            val viewBuilder = LynxViewBuilder()
            TamerNavLynxRuntime.configureBuilder(ctx, viewBuilder, src)
            GeneratedLynxExtensions.configureViewBuilder(viewBuilder)
            viewBuilder.build(ctx)
        }
    }
}
