package {{PACKAGE_NAME}}

import android.content.Context
import com.lynx.tasm.LynxBooleanOption
import com.lynx.tasm.LynxGroup
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.group.ILynxViewGroup
import com.lynx.tasm.group.LynxViewGroupBuilder
import com.lynx.xelement.XElementBehaviors

/**
 * Shared LynxGroup plus per-bundle LynxViewGroups for the project LynxView and TamerNav spokes.
 * Module-singleton stores such as Zustand rely on this shared runtime group.
 */
object TamerNavLynxRuntime {
    init {
        android.util.Log.w(
            "TamerHeap",
            "Lynx does not share JS heap across LynxViews; module-singleton stores re-init per spoke. Use TamerStateSyncProvider from @tamer4lynx/tamer-router for cross-spoke continuity. See tamer-navigation README.",
        )
    }

    val group: LynxGroup = LynxGroup.LynxGroupBuilder()
        .setGroupName("TamerNav")
        .setID(LynxGroup.SINGNLE_GROUP)
        .setEnableJSGroupThread(true)
        .build()

    private val viewGroups = LinkedHashMap<String, ILynxViewGroup>()

    @Synchronized
    fun viewGroup(context: Context, src: String): ILynxViewGroup {
        val key = src.ifBlank { "main.lynx.bundle" }
        return viewGroups.getOrPut(key) {
            val appContext = context.applicationContext ?: context
            val provider = TemplateProvider(appContext)
            val groupBuilder = LynxViewGroupBuilder()
                .setContext(appContext)
                .setUrl(key)
                .setLynxGroup(group)
                .addBehaviors(XElementBehaviors().create())
            groupBuilder.setEnableGenericResourceFetcher(LynxBooleanOption.TRUE)
            groupBuilder.setTemplateResourceFetcher(provider.templateResourceFetcher)
            groupBuilder.setGenericResourceFetcher(provider.genericResourceFetcher)
            groupBuilder.build()
        }
    }

    fun configureBuilder(context: Context, viewBuilder: LynxViewBuilder, src: String) {
        val provider = TemplateProvider(context)
        val vg = viewGroup(context, src)
        viewBuilder.setLynxViewGroup(vg)
        viewBuilder.setLynxGroup(group)
        viewBuilder.setTemplateProvider(provider)
        viewBuilder.setEnableGenericResourceFetcher(LynxBooleanOption.TRUE)
        viewBuilder.setTemplateResourceFetcher(provider.templateResourceFetcher)
        viewBuilder.setGenericResourceFetcher(provider.genericResourceFetcher)
        android.util.Log.i(
            "TamerHeap",
            "configure src=$src group=${System.identityHashCode(group)} viewGroup=${System.identityHashCode(vg)}",
        )
    }
}
