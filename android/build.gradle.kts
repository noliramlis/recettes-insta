plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}

// Sous Windows, le dossier de build est placé hors du projet : l'éditeur ou l'antivirus
// y verrouillent des fichiers, ce qui fait échouer les builds suivants.
System.getenv("LOCALAPPDATA")?.let { local ->
    allprojects { layout.buildDirectory.set(File(local, "Android/build/recettes-insta/${project.name}")) }
}
