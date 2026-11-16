plugins {
    id("com.android.application")
}

android {
    namespace = "com.serieradar.app"
    compileSdk = 34
    buildToolsVersion = "34.0.0"

    defaultConfig {
        applicationId = "com.serieradar.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 11
        versionName = "1.5.5"
    }

    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = "seriesradar123"
            keyAlias = "seriesradar"
            keyPassword = "seriesradar123"
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

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}

configurations.all {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk7")
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk8")
}
