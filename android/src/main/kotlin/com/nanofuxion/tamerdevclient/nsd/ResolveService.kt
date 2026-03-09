package com.nanofuxion.tamerdevclient.nsd

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Suppress("DEPRECATION")
suspend fun NsdManager.resolveServiceCoroutine(serviceInfo: NsdServiceInfo): NsdServiceInfo =
    suspendCancellableCoroutine { cont ->
        resolveService(
            serviceInfo,
            object : NsdManager.ResolveListener {
                override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                    if (cont.isActive) {
                        cont.resumeWithException(RuntimeException("Resolve failed: errorCode=$errorCode"))
                    }
                }

                override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
                    if (cont.isActive) {
                        cont.resume(resolvedInfo)
                    }
                }
            }
        )
    }
