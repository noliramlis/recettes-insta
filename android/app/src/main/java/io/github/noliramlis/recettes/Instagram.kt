package io.github.noliramlis.recettes

import android.annotation.SuppressLint
import android.app.Activity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * Navigateur Instagram caché : une WebView invisible, ouverte sur une page neutre
 * d'instagram.com, dans laquelle on exécute assets/instagram.js. Elle partage les cookies
 * de connexion de l'appli (LoginActivity), comme un onglet de navigateur.
 */
@SuppressLint("SetJavaScriptEnabled")
class Instagram(private val activity: Activity, parent: ViewGroup, private val listener: Listener) {

    interface Listener {
        fun onProgress(text: String)
        fun onCollections(json: String)
        fun onBatch(json: String)
        fun onDone(added: Int)
        fun onPost(json: String)
        fun onMe(username: String)
        /** [command] : la commande qui a échoué, pour la relancer après connexion. */
        fun onError(message: String, needsLogin: Boolean, command: String)
    }

    private val web = WebView(activity)
    private val script = activity.assets.open("instagram.js").bufferedReader().use { it.readText() }
    private var loaded = false
    private var pending: String? = null

    /** Commande en cours (null si aucune). */
    var command: String? = null
        private set
    val busy get() = command != null

    init {
        parent.addView(web, FrameLayout.LayoutParams(1, 1))
        web.alpha = 0f
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.userAgentString = browserUserAgent(web.settings.userAgentString)
        web.addJavascriptInterface(Bridge(), "IgBridge")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                if (!url.startsWith(PAGE)) return
                web.evaluateJavascript(script, null)
                loaded = true
                pending?.let { pending = null; web.evaluateJavascript(it, null) }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                loaded = false
                pending = null
                val c = command ?: return
                command = null
                listener.onError("Instagram injoignable : vérifie ta connexion internet.", false, c)
            }
        }
    }

    /** Exécute une commande de instagram.js, par ex. `__RI.post("CODE")`. */
    fun run(cmd: String) {
        command = cmd
        if (loaded) web.evaluateJavascript(cmd, null)
        else { pending = cmd; web.loadUrl(PAGE) }
    }

    fun logout(done: () -> Unit) {
        loaded = false
        web.loadUrl("about:blank")
        CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush(); done() }
    }

    private inner class Bridge {
        private fun ui(finish: Boolean = false, block: () -> Unit) = activity.runOnUiThread {
            if (finish) command = null
            block()
        }

        @JavascriptInterface fun progress(text: String) = ui { listener.onProgress(text) }
        @JavascriptInterface fun collections(json: String) = ui(true) { listener.onCollections(json) }
        @JavascriptInterface fun batch(json: String) = ui { listener.onBatch(json) }
        @JavascriptInterface fun done(added: Int) = ui(true) { listener.onDone(added) }
        @JavascriptInterface fun post(json: String) = ui(true) { listener.onPost(json) }
        @JavascriptInterface fun me(username: String) = ui(true) { listener.onMe(username) }
        @JavascriptInterface fun error(message: String) {
            activity.runOnUiThread {
                val c = command ?: ""
                command = null
                if (message == "login") listener.onError("Connexion à Instagram nécessaire.", true, c)
                else listener.onError(message, false, c)
            }
        }
    }

    companion object {
        /** Page neutre d'instagram.com (texte brut, sans scripts) : même origine que l'API. */
        const val PAGE = "https://www.instagram.com/robots.txt"

        fun loggedIn(): Boolean =
            CookieManager.getInstance().getCookie("https://www.instagram.com")?.contains("sessionid=") == true

        /** User-agent de la WebView sans les marques « WebView » (Instagram se comporte comme dans Chrome). */
        fun browserUserAgent(ua: String): String =
            ua.replace("; wv", "").replace(Regex("Version/[\\d.]+ "), "")
    }
}
