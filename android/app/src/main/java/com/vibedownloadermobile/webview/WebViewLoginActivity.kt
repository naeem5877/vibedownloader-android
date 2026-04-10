package com.vibedownloadermobile.webview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import java.io.File

/**
 * WebViewLoginActivity - Sandboxed WebView for platform authentication
 * Features:
 * - Loads the real platform login page in a sandboxed WebView
 * - Monitors navigation and auto-detects successful login
 * - Extracts all cookies after login and saves in Netscape format
 * - Cool dark UI with platform-specific branding
 */
class WebViewLoginActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PLATFORM = "platform"
        const val RESULT_SUCCESS = "success"
        const val RESULT_PLATFORM = "platform"
        const val RESULT_COOKIE_COUNT = "cookieCount"
        const val RESULT_ERROR = "error"
        const val TAG = "WebViewLoginActivity"

        // Platform configurations
        data class PlatformConfig(
            val name: String,
            val loginUrl: String,
            val successDomains: List<String>,    // URLs that indicate successful login
            val successPaths: List<String>,       // URL paths that indicate successful login
            val color: Int,
            val domains: List<String>             // Domains to extract cookies from
        )

        val PLATFORM_CONFIGS = mapOf(
            "instagram" to PlatformConfig(
                name = "Instagram",
                loginUrl = "https://www.instagram.com/accounts/login/",
                successDomains = listOf("www.instagram.com"),
                successPaths = listOf("/", "/home/", "/reels/", "/direct/"),
                color = Color.parseColor("#E1306C"),
                domains = listOf("https://www.instagram.com", "https://instagram.com")
            ),
            "facebook" to PlatformConfig(
                name = "Facebook",
                loginUrl = "https://m.facebook.com/login",
                successDomains = listOf("m.facebook.com", "www.facebook.com"),
                successPaths = listOf("/home.php", "/", "/feed/", "/?sk=h_chr"),
                color = Color.parseColor("#1877F2"),
                domains = listOf("https://www.facebook.com", "https://m.facebook.com")
            ),
            "tiktok" to PlatformConfig(
                name = "TikTok",
                loginUrl = "https://www.tiktok.com/login",
                successDomains = listOf("www.tiktok.com"),
                successPaths = listOf("/foryou", "/following", "/", "/explore"),
                color = Color.parseColor("#010101"),
                domains = listOf("https://www.tiktok.com")
            ),
            "youtube" to PlatformConfig(
                name = "YouTube",
                loginUrl = "https://accounts.google.com/ServiceLogin?service=youtube",
                successDomains = listOf("www.youtube.com", "youtube.com"),
                successPaths = listOf("/", "/feed/", "/watch"),
                color = Color.parseColor("#FF0000"),
                domains = listOf("https://www.youtube.com", "https://youtube.com")
            )
        )
    }

    private lateinit var platform: String
    private lateinit var config: PlatformConfig
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    private var loginDetected = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        platform = intent.getStringExtra(EXTRA_PLATFORM) ?: "instagram"
        config = PLATFORM_CONFIGS[platform] ?: PLATFORM_CONFIGS["instagram"]!!

        setupUI()
        setupWebView()
    }

    private fun setupUI() {
        // Dark premium UI setup
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0A0A0F"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Top Bar
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#12121A"))
            setPadding(48, 56, 48, 24)
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Close / Back button
        val closeBtn = TextView(this).apply {
            text = "✕"
            textSize = 20f
            setTextColor(Color.parseColor("#8888AA"))
            setPadding(0, 0, 32, 0)
            setOnClickListener {
                val resultIntent = Intent().apply {
                    putExtra(RESULT_SUCCESS, false)
                    putExtra(RESULT_ERROR, "Login cancelled")
                }
                setResult(Activity.RESULT_CANCELED, resultIntent)
                finish()
            }
        }

        val titleView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val platformNameText = TextView(this).apply {
            text = config.name
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

        val subtitleText = TextView(this).apply {
            text = "Sign in with your ${config.name} account"
            textSize = 13f
            setTextColor(Color.parseColor("#6666AA"))
        }

        titleView.addView(platformNameText)
        titleView.addView(subtitleText)

        // Done button
        val doneBtn = TextView(this).apply {
            text = "Done ✓"
            textSize = 15f
            setTextColor(config.color)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setOnClickListener { checkAndSaveCookies() }
        }

        topBar.addView(closeBtn)
        topBar.addView(titleView)
        topBar.addView(doneBtn)

        // Progress Bar
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                8
            )
            progressDrawable.setColorFilter(config.color, android.graphics.PorterDuff.Mode.SRC_IN)
            visibility = View.VISIBLE
            max = 100
        }

        // Status Text
        statusText = TextView(this).apply {
            text = "Loading ${config.name}..."
            textSize = 12f
            setTextColor(Color.parseColor("#4444AA"))
            setPadding(48, 8, 48, 8)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Info Banner
        val infoBanner = TextView(this).apply {
            text = "🔒  Your login is sandboxed and private. Tap 'Done ✓' after signing in."
            textSize = 12f
            setTextColor(Color.parseColor("#5555AA"))
            setPadding(48, 16, 48, 16)
            setBackgroundColor(Color.parseColor("#0D0D1F"))
        }

        // WebView
        webView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }

        rootLayout.addView(topBar)
        rootLayout.addView(progressBar)
        rootLayout.addView(infoBanner)
        rootLayout.addView(statusText)
        rootLayout.addView(webView)

        setContentView(rootLayout)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        // Enable 3rd party cookies for Android 5+
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            // Use a mobile user agent for better compatibility
            userAgentString = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            allowFileAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                val shortUrl = url?.take(60) ?: ""
                statusText.text = "Loading: $shortUrl..."
                progressBar.visibility = View.VISIBLE
                Log.d(TAG, "Page started: $url")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.INVISIBLE
                statusText.text = url?.take(60) ?: ""
                CookieManager.getInstance().flush()

                Log.d(TAG, "Page finished: $url")

                // Auto-detect login success
                if (!loginDetected && url != null) {
                    checkLoginSuccess(url)
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false // Let the WebView handle all navigation
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
            }
        }

        // Load the login page
        webView.loadUrl(config.loginUrl)
    }

    private fun checkLoginSuccess(url: String) {
        val isSuccessPath = config.successDomains.any { domain -> url.contains(domain) } &&
            config.successPaths.any { path ->
                try {
                    val uri = android.net.Uri.parse(url)
                    val uriPath = uri.path ?: "/"
                    uriPath == path || uriPath.startsWith(path) || path == "/"
                } catch (e: Exception) { false }
            }

        // Extra checks: if we're no longer on the login page
        val loginKeywords = listOf("login", "accounts/login", "signin", "sign-in", "auth")
        val isLoginPage = loginKeywords.any { url.contains(it, ignoreCase = true) }

        val cookieString = CookieManager.getInstance().getCookie(config.domains.first())
        val hasCookies = !cookieString.isNullOrEmpty() && cookieString.length > 50

        if (isSuccessPath && hasCookies && !isLoginPage) {
            Log.d(TAG, "Login detected for $platform at $url")
            // Small delay to ensure all cookies are set
            webView.postDelayed({ checkAndSaveCookies() }, 1500)
        }
    }

    private fun checkAndSaveCookies() {
        if (loginDetected) return
        loginDetected = true

        Log.d(TAG, "Extracting cookies for $platform...")
        statusText.text = "✅ Saving your session..."
        progressBar.visibility = View.VISIBLE
        progressBar.isIndeterminate = true

        val cookieLines = StringBuilder()
        cookieLines.appendLine("# Netscape HTTP Cookie File")
        cookieLines.appendLine("# Extracted by VibeDownloader from WebView")
        cookieLines.appendLine("# Platform: $platform")
        cookieLines.appendLine()

        var cookieCount = 0
        val processedNames = mutableSetOf<String>()
        val cookieManager = CookieManager.getInstance()

        for (url in config.domains) {
            val rawCookies = cookieManager.getCookie(url) ?: continue
            Log.d(TAG, "Raw cookies for $url: length=${rawCookies.length}")

            val domain = try {
                ".${android.net.Uri.parse(url).host ?: ""}"
            } catch (e: Exception) { ".${platform}.com" }

            rawCookies.split(";").forEach { pair ->
                val trimmed = pair.trim()
                if (trimmed.isBlank() || !trimmed.contains("=")) return@forEach

                val eqIdx = trimmed.indexOf('=')
                val name = trimmed.substring(0, eqIdx).trim()
                val value = trimmed.substring(eqIdx + 1).trim()

                if (name.isBlank() || processedNames.contains(name)) return@forEach
                processedNames.add(name)

                val expiry = (System.currentTimeMillis() / 1000) + (365L * 24 * 3600)
                cookieLines.appendLine("$domain\tTRUE\t/\tTRUE\t$expiry\t$name\t$value")
                cookieCount++
            }
        }

        Log.d(TAG, "Extracted $cookieCount cookies for $platform")

        if (cookieCount < 3) {
            // Not enough cookies - likely not logged in
            loginDetected = false
            statusText.text = "⚠️ Not logged in yet. Please sign in and tap 'Done ✓'"
            progressBar.visibility = View.INVISIBLE
            progressBar.isIndeterminate = false
            return
        }

        // Save cookies to file
        try {
            val cookieDir = File(filesDir, "platform_cookies")
            if (!cookieDir.exists()) cookieDir.mkdirs()

            val cookieFile = File(cookieDir, "${platform}_cookies.txt")
            cookieFile.writeText(cookieLines.toString())

            // Return success to React Native
            val resultIntent = Intent().apply {
                putExtra(RESULT_SUCCESS, true)
                putExtra(RESULT_PLATFORM, platform)
                putExtra(RESULT_COOKIE_COUNT, cookieCount)
            }
            setResult(Activity.RESULT_OK, resultIntent)
            finish()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to save cookies", e)
            loginDetected = false
            statusText.text = "❌ Error saving session: ${e.message}"
            progressBar.visibility = View.INVISIBLE
            progressBar.isIndeterminate = false
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            val resultIntent = Intent().apply {
                putExtra(RESULT_SUCCESS, false)
                putExtra(RESULT_ERROR, "Login cancelled")
            }
            setResult(Activity.RESULT_CANCELED, resultIntent)
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }
}
