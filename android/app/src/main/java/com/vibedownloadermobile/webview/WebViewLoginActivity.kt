package com.vibedownloadermobile.webview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
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
 * - Premium dark UI with platform-specific branding
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
                domains = listOf(
                    "https://www.instagram.com",
                    "https://instagram.com",
                    "https://i.instagram.com",
                    "https://m.instagram.com"
                )
            ),
            "facebook" to PlatformConfig(
                name = "Facebook",
                loginUrl = "https://m.facebook.com/login",
                successDomains = listOf("m.facebook.com", "www.facebook.com"),
                successPaths = listOf("/home.php", "/", "/feed/", "/?sk=h_chr"),
                color = Color.parseColor("#1877F2"),
                domains = listOf(
                    "https://www.facebook.com",
                    "https://m.facebook.com",
                    "https://facebook.com"
                )
            ),
            "tiktok" to PlatformConfig(
                name = "TikTok",
                loginUrl = "https://www.tiktok.com/login",
                successDomains = listOf("www.tiktok.com"),
                successPaths = listOf("/foryou", "/following", "/", "/explore"),
                color = Color.parseColor("#FE2C55"),
                domains = listOf(
                    "https://www.tiktok.com",
                    "https://m.tiktok.com",
                    "https://tiktok.com"
                )
            ),
            "youtube" to PlatformConfig(
                name = "YouTube",
                loginUrl = "https://accounts.google.com/ServiceLogin?service=youtube",
                successDomains = listOf("www.youtube.com", "youtube.com"),
                successPaths = listOf("/", "/feed/", "/watch"),
                color = Color.parseColor("#FF0000"),
                domains = listOf(
                    "https://www.youtube.com",
                    "https://youtube.com",
                    "https://accounts.google.com"
                )
            ),
            "twitter" to PlatformConfig(
                name = "Twitter",
                loginUrl = "https://twitter.com/login",
                successDomains = listOf("twitter.com", "x.com"),
                successPaths = listOf("/home", "/"),
                color = Color.parseColor("#1DA1F2"),
                domains = listOf(
                    "https://x.com",
                    "https://twitter.com",
                    "https://www.twitter.com"
                )
            ),
            "twitch" to PlatformConfig(
                name = "Twitch",
                loginUrl = "https://www.twitch.tv/login",
                successDomains = listOf("twitch.tv"),
                successPaths = listOf("/"),
                color = Color.parseColor("#9146FF"),
                domains = listOf(
                    "https://www.twitch.tv",
                    "https://twitch.tv"
                )
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
        // High-end Dark Background
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#08080C"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Top Bar with Glass-like effect
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#12121A"))
            setPadding(56, 64, 56, 32)
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Close / Back button - Premium Style
        val closeBtn = TextView(this).apply {
            text = "✕"
            textSize = 22f
            setTextColor(Color.parseColor("#8888AA"))
            setPadding(0, 0, 48, 0)
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
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            letterSpacing = -0.02f
        }

        val subtitleText = TextView(this).apply {
            text = "Secure Sandbox Login"
            textSize = 12f
            setTextColor(Color.parseColor("#6666AA"))
            setAllCaps(true)
            letterSpacing = 0.05f
        }

        titleView.addView(platformNameText)
        titleView.addView(subtitleText)

        // Done button - Floating Action Look
        val doneBtn = TextView(this).apply {
            text = "DONE"
            textSize = 14f
            setTextColor(config.color)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            letterSpacing = 0.1f
            setPadding(32, 16, 32, 16)
            setBackgroundDrawable(GradientDrawable().apply {
                cornerRadius = 12f
                setStroke(2, config.color)
            })
            setOnClickListener { checkAndSaveCookies() }
        }

        topBar.addView(closeBtn)
        topBar.addView(titleView)
        topBar.addView(doneBtn)

        // Progress Bar - Thin & Elegant
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                6
            )
            progressDrawable.setColorFilter(config.color, android.graphics.PorterDuff.Mode.SRC_IN)
            visibility = View.VISIBLE
            max = 100
        }

        // Info Banner - Modern Alert Style
        val infoBanner = TextView(this).apply {
            text = "🔒 Your data is encrypted and never stored on our servers."
            textSize = 11f
            setTextColor(Color.parseColor("#AAAAFF"))
            setPadding(56, 24, 56, 24)
            setBackgroundColor(Color.parseColor("#0D0D26"))
        }

        // Status Text
        statusText = TextView(this).apply {
            text = "Initializing session..."
            textSize = 12f
            setTextColor(Color.parseColor("#555588"))
            setPadding(56, 12, 56, 12)
        }

        // WebView Container
        val webViewContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#08080C"))
        }

        webViewContainer.addView(webView)

        rootLayout.addView(topBar)
        rootLayout.addView(progressBar)
        rootLayout.addView(infoBanner)
        rootLayout.addView(statusText)
        rootLayout.addView(webViewContainer)

        setContentView(rootLayout)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
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
            userAgentString = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            allowFileAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                statusText.text = "Navigating to ${config.name}..."
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.INVISIBLE
                statusText.text = "Ready to Login"
                CookieManager.getInstance().flush()

                if (!loginDetected && url != null) {
                    checkLoginSuccess(url)
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = false
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
            }
        }

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

        val loginKeywords = listOf("login", "accounts/login", "signin", "sign-in", "auth")
        val isLoginPage = loginKeywords.any { url.contains(it, ignoreCase = true) }

        val cookieString = CookieManager.getInstance().getCookie(config.domains.first())
        val hasCookies = !cookieString.isNullOrEmpty() && cookieString.length > 50

        if (isSuccessPath && hasCookies && !isLoginPage) {
            Log.d(TAG, "Login detected for $platform at $url")
            webView.postDelayed({ checkAndSaveCookies() }, 2000)
        }
    }

    private fun checkAndSaveCookies() {
        if (loginDetected) return
        loginDetected = true

        statusText.text = "✅ Saving your session..."
        progressBar.visibility = View.VISIBLE
        progressBar.isIndeterminate = true

        val cookieManager = CookieManager.getInstance()
        cookieManager.flush()

        val criticalCookies = mapOf(
            "instagram" to listOf("sessionid"),
            "facebook"  to listOf("c_user", "xs"),
            "youtube"   to listOf("SID"),
            "tiktok"    to listOf("sessionid"),
            "twitter"   to listOf("auth_token"),
            "twitch"    to listOf("auth-token")
        )

        val domainsToCheck = config.domains

        val cookieLines = StringBuilder()
        cookieLines.appendLine("# Netscape HTTP Cookie File")
        cookieLines.appendLine("# https://curl.haxx.se/rfc/cookie_spec.html")
        cookieLines.appendLine("# Extracted by VibeDownloader Mobile")
        cookieLines.appendLine()

        var cookieCount = 0
        val processedNames = mutableSetOf<String>()

        for (url in domainsToCheck) {
            val rawCookies = cookieManager.getCookie(url) ?: continue
            Log.d(TAG, "Cookies for $url: ${rawCookies.take(100)}...")

            val host = try {
                android.net.Uri.parse(url).host ?: continue
            } catch (e: Exception) { continue }

            val cleanDomain = "." + host.replace(Regex("^(www|m|i|accounts)\\.", RegexOption.IGNORE_CASE), "")

            rawCookies.split(";").forEach { pair ->
                val trimmed = pair.trim()
                if (trimmed.isBlank() || !trimmed.contains("=")) return@forEach
                val eqIdx = trimmed.indexOf('=')
                val name = trimmed.substring(0, eqIdx).trim()
                val value = trimmed.substring(eqIdx + 1).trim()
                if (name.isBlank() || processedNames.contains(name)) return@forEach
                processedNames.add(name)
                val expiry = (System.currentTimeMillis() / 1000) + (365L * 24 * 3600)
                cookieLines.appendLine("$cleanDomain\tTRUE\t/\t${if (url.startsWith("https")) "TRUE" else "FALSE"}\t$expiry\t$name\t$value")
                cookieCount++
            }
        }

        // Check critical cookies
        val required = criticalCookies[platform] ?: emptyList()
        val missing = required.filter { !processedNames.contains(it) }
        
        if (missing.isNotEmpty()) {
            Log.w(TAG, "Missing critical cookies: $missing")
            loginDetected = false
            statusText.text = "⚠️ Missing: ${missing.joinToString(", ")}. Please sign in completely."
            progressBar.visibility = View.INVISIBLE
            progressBar.isIndeterminate = false
            return
        }

        try {
            // ✅ KEY FIX: Save to SAME path that YtDlpModule.saveCookiesToFile() uses
            val cookieFile = File(filesDir, "cookies_${platform}.txt")
            cookieFile.writeText(cookieLines.toString())
            
            Log.d(TAG, "✅ Cookies saved to: ${cookieFile.absolutePath}")

            val resultIntent = Intent().apply {
                putExtra(RESULT_SUCCESS, true)
                putExtra(RESULT_PLATFORM, platform)
                putExtra(RESULT_COOKIE_COUNT, cookieCount)
                putExtra("cookiePath", cookieFile.absolutePath) // ✅ Pass path back!
            }
            setResult(Activity.RESULT_OK, resultIntent)
            finish()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to save cookies", e)
            loginDetected = false
            statusText.text = "❌ Error: ${e.message}"
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
