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
        versionCode = 39
        versionName = "1.15.1"
    }

    signingConfigs {
        create("release") {
            // Same debug keystore that signed previously distributed APKs.
            // Using the identical certificate is REQUIRED for in-place updates
            // on devices where older versions are already installed.
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
