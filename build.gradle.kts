// Top-level Gradle build file for Imdad Android ERP (Kotlin 2.1 + Jetpack Compose Material 3 + Room SQLCipher v31)
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
