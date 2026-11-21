package io.github.noliramlis.recettes

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Connexion à Instagram (une fois) : la page de connexion officielle, dans l'appli.
 * Avec [EXTRA_PICK] : Instagram s'ouvre et l'utilisateur va jusqu'à sa collection ; son adresse
 * (…/saved/nom/12345/) donne le numéro de la collection, renvoyé à l'appli.
 */
class LoginActivity : ComponentActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var web: WebView
    private val pick by lazy { intent.getBooleanExtra(EXTRA_PICK, false) }
    private var user = ""
    private var pickedUser = "" // nom du compte, déduit de l'adresse du profil

    private val check = object : Runnable {
        override fun run() {
            if (pick) return
            if (Instagram.loggedIn()) {
                CookieManager.getInstance().flush()
                setResult(RESULT_OK)
                finish()
            } else handler.postDelayed(this, 1000)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        user = intent.getStringExtra(EXTRA_USER).orEmpty()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(getColor(R.color.bg))
        }
        val pad = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 14f, resources.displayMetrics).toInt()
        val info = TextView(this).apply {
            text = if (pick && user.isNotEmpty()) "Touche ta collection de recettes : l'appli la reconnaîtra toute seule."
            else if (pick) "Touche ta photo de profil (en bas à droite) : tes enregistrements s'ouvriront. " +
                "Touche ensuite ta collection de recettes."
            else "Connecte-toi à Instagram (une seule fois) : l'appli pourra lire tes enregistrements " +
                "et les posts que tu partages. Tes identifiants vont directement à Instagram."
            setTextColor(getColor(R.color.ink))
            textSize = 14f
            setPadding(pad, pad, pad, pad)
        }
        web = WebView(this)
        root.addView(info)
        if (pick) {
            // Secours : la présentation « ordinateur » d'Instagram (menu ☰ Plus → Enregistrements).
            val desktop = Button(this).apply {
                text = "Version ordinateur"
                isAllCaps = false
                setOnClickListener {
                    isEnabled = false
                    web.settings.userAgentString = DESKTOP_UA
                    web.settings.useWideViewPort = true
                    web.settings.loadWithOverviewMode = true
                    web.settings.builtInZoomControls = true
                    web.settings.displayZoomControls = false
                    web.loadUrl(startUrl())
                }
            }
            root.addView(desktop, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { marginStart = pad; bottomMargin = pad / 2 })
        }
        root.addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = !night

        CookieManager.getInstance().setAcceptCookie(true)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.userAgentString = Instagram.browserUserAgent(web.settings.userAgentString)
        web.webViewClient = object : WebViewClient() {
            // Reste dans la page : bloque les liens « Ouvrir l'appli Instagram » (intent://…).
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                request.url.scheme != "https" && request.url.scheme != "http"

            // L'adresse change aussi sans rechargement (navigation interne d'Instagram).
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                if (!pick) return
                // Profil ouvert (…/nom/) : on enchaîne sur ses enregistrements.
                PROFILE_URL.find(url)?.let { p ->
                    val name = p.groupValues[1]
                    if (name.lowercase() !in RESERVED && name != pickedUser) {
                        pickedUser = name
                        view.loadUrl("https://www.instagram.com/$name/saved/")
                    }
                    return
                }
                val m = COLLECTION_URL.find(url) ?: return
                val id = if (m.groupValues[1] == "all-posts") "ALL" else m.groupValues[2].ifEmpty { return }
                val name = if (id == "ALL") "Tous mes enregistrements"
                else Uri.decode(m.groupValues[1]).replace('-', ' ').replaceFirstChar { it.uppercase() }
                val owner = Regex("""instagram\.com/([\w.]+)/saved""").find(url)?.groupValues?.get(1).orEmpty()
                setResult(RESULT_OK, Intent().putExtra("id", id).putExtra("name", name).putExtra("user", owner))
                finish()
            }
        }
        onBackPressedDispatcher.addCallback(this) { if (web.canGoBack()) web.goBack() else finish() }
        web.loadUrl(startUrl())
    }

    private fun startUrl() = when {
        !pick -> "https://www.instagram.com/accounts/login/"
        user.isNotEmpty() -> "https://www.instagram.com/${Uri.encode(user)}/saved/"
        else -> "https://www.instagram.com/"
    }

    companion object {
        const val EXTRA_PICK = "pick"
        const val EXTRA_USER = "user"
        private const val DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        private val PROFILE_URL = Regex("""instagram\.com/([\w.]+)/?(?:[?#].*)?$""")
        private val RESERVED = setOf("explore", "reels", "direct", "accounts", "stories", "p", "reel", "tv", "about", "legal", "web", "challenge")
        private val COLLECTION_URL = Regex("""instagram\.com/[\w.]+/saved/([^/?#]+)/?(\d*)""")
    }

    override fun onResume() { super.onResume(); handler.post(check) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(check) }
}
