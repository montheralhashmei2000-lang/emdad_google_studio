# R8 / ProGuard Rules for Imdad Android ERP (Room + SQLCipher + Kotlin Serialization)
-keep class net.zetetic.database.** { *; }
-keep class net.zetetic.database.sqlcipher.** { *; }
-keep class com.imdad.erp.data.db.** { *; }
-keepattributes *Annotation*,InnerClasses,Signature
-dontwarn net.zetetic.database.sqlcipher.**
