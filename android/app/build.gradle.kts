plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// L'interface est celle du site (la PWA, dossier parent) : copiée dans l'APK à chaque build.
val webSrc = rootProject.projectDir.parentFile
val webOut = layout.buildDirectory.dir("generated/web").get().asFile
val copyWeb by tasks.registering(Sync::class) {
    from(webSrc) {
        include("index.html", "app.js", "parser.js", "ingredients.js", "db.js", "style.css", "icon-192.png")
    }
    into(File(webOut, "web"))
}

android {
    namespace = "io.github.noliramlis.recettes"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.noliramlis.recettes"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Appli installée hors store : signée avec la clé locale de ce PC.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(webOut)
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
