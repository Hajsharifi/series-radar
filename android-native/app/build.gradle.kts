plugins {
    id("com.android.application")
}

android {
    namespace = "com.serieradar.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.serieradar.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 64
        versionName = "1.16.16"
    }

    signingConfigs {
        create("release") {
            fun envOrProp(env: String, prop: String): String? {
                val v = System.getenv(env) ?: (project.findProperty(prop) as String?)
                return v?.takeIf { it.isNotBlank() }
            }
            val ksFile = envOrProp("SERIES_RADAR_KEYSTORE", "seriesRadar.keystore")
            val ksPassword = envOrProp("SERIES_RADAR_KEYSTORE_PASSWORD", "seriesRadar.keystorePassword")
            val alias = envOrProp("SERIES_RADAR_KEY_ALIAS", "seriesRadar.keyAlias")
            val keyPass = envOrProp("SERIES_RADAR_KEY_PASSWORD", "seriesRadar.keyPassword")
            if (ksFile != null && ksPassword != null && alias != null && keyPass != null) {
                storeFile = file(ksFile)
                storePassword = ksPassword
                keyAlias = alias
                keyPassword = keyPass
            } else {
                // Fallback for local development only. CI and release builds MUST
                // provide the env/properties above (private release key).
                storeFile = file("debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Copy freshly built web assets into the Android assets folder before every
// build. This makes it impossible to ship an APK with stale/missing JS chunks.
abstract class SyncWebAssets : DefaultTask() {
    @get:InputFiles
    abstract val sourceDir: DirectoryProperty

    @TaskAction
    fun sync() {
        val src = sourceDir.get().asFile
        val dst = File(project.projectDir, "src/main/assets/web")
        if (!src.exists()) throw GradleException("web/dist not found: ${src.absolutePath}")
        dst.deleteRecursively()
        src.copyRecursively(dst, overwrite = true)
        logger.lifecycle("Synced web assets: ${src.absolutePath} -> ${dst.absolutePath}")
    }
}

val syncWebAssets by tasks.registering(SyncWebAssets::class) {
    sourceDir.set(file("../../web/dist"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.work:work-runtime:2.9.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}

configurations.all {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk7")
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk8")
}
