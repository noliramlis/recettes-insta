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
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(getColor(R.color.bg))
        }
        val pad = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 14f, resources.displayMetrics).toInt()
        val info = TextView(this).apply {
            text = if (pick) "Ouvre ta collection de recettes : touche ton profil, puis ☰ → Enregistrements → " +
                "ta collection. L'appli la reconnaîtra toute seule."
            else "Connecte-toi à Instagram (une seule fois) : l'appli pourra lire tes enregistrements " +
                "et les posts que tu partages. Tes identifiants vont directement à Instagram."
            setTextColor(getColor(R.color.ink))
            textSize = 14f
            setPadding(pad, pad, pad, pad)
        }
        web = WebView(this)
        root.addView(info)
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
                val m = COLLECTION_URL.find(url) ?: return
                val id = if (m.groupValues[1] == "all-posts") "ALL" else m.groupValues[2].ifEmpty { return }
                val name = if (id == "ALL") "Tous mes enregistrements"
                else Uri.decode(m.groupValues[1]).replace('-', ' ').replaceFirstChar { it.uppercase() }
                setResult(RESULT_OK, Intent().putExtra("id", id).putExtra("name", name))
                finish()
            }
        }
        onBackPressedDispatcher.addCallback(this) { if (web.canGoBack()) web.goBack() else finish() }
        web.loadUrl(if (pick) "https://www.instagram.com/" else "https://www.instagram.com/accounts/login/")
    }

    companion object {
        const val EXTRA_PICK = "pick"
        private val COLLECTION_URL = Regex("""instagram\.com/[\w.]+/saved/([^/?#]+)/?(\d*)""")
    }

    override fun onResume() { super.onResume(); handler.post(check) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(check) }
}
