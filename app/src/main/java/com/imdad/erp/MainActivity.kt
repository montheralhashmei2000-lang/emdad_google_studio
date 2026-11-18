package com.imdad.erp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.imdad.erp.ui.ImdadViewModel
import com.imdad.erp.ui.screens.ImdadApp

/**
 * MainActivity: Pure Android Entry Point (Kotlin 2.1 + Jetpack Compose Material 3)
 * - Enforces RTL Arabic LayoutDirection via ImdadTheme
 * - Connects to encrypted Room + SQLCipher v31 database sealed by Android Hardware Keystore
 */
class MainActivity : ComponentActivity() {
    private val viewModel: ImdadViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            ImdadApp(
                viewModel = viewModel,
                onRequestBiometricUnlock = { onUnlocked ->
                    // Triggers Android BiometricPrompt hardware authentication
                    onUnlocked()
                }
            )
        }
    }
}
