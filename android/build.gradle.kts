plugins {
    id("com.android.library") version "8.9.1"
    id("org.jetbrains.kotlin.android") version "2.0.21"
}

val lynxSdk: String = run {
    val text = file("../package.json").readText()
    Regex("\"lynxSdk\"\\s*:\\s*\"([^\"]+)\"").find(text)?.groupValues?.get(1)
        ?: error("package.json must define \"lynxSdk\": \"x.y.z\" (Lynx Android artifacts version)")
}

android {
    namespace = "com.nanofuxion.tamerdevclient"
    compileSdk = 35

    defaultConfig {
        minSdk = 28
        buildConfigField("String", "DECLARED_LYNX_SDK_VERSION", "\"$lynxSdk\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Must match host app Lynx version (libs.versions.toml); devtool/core mismatch crashes at LynxEnv.init.
    implementation("org.lynxsdk.lynx:lynx-service-log:$lynxSdk")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.lynxsdk.lynx:lynx:$lynxSdk")
    implementation("org.lynxsdk.lynx:lynx-jssdk:$lynxSdk")
    implementation("org.lynxsdk.lynx:lynx-trace:$lynxSdk")
    implementation("com.squareup.okhttp3:okhttp:4.9.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.squareup:seismic:1.0.3")
    debugImplementation("org.lynxsdk.lynx:lynx-devtool:$lynxSdk")
    debugImplementation("org.lynxsdk.lynx:lynx-service-devtool:$lynxSdk")
}
