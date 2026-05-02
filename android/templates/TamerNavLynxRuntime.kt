package {{PACKAGE_NAME}}

import com.lynx.tasm.LynxGroup

/**
 * Shared LynxGroup for the project LynxView and TamerNav stack spokes.
 * Module-singleton stores such as Zustand rely on this shared JS context group.
 */
object TamerNavLynxRuntime {
    val group: LynxGroup = LynxGroup.LynxGroupBuilder()
        .setGroupName("TamerNav")
        .setID(LynxGroup.SINGNLE_GROUP)
        .setEnableJSGroupThread(true)
        .build()
}
