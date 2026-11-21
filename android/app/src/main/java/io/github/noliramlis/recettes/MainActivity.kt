package io.github.noliramlis.recettes

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject

/**
 * L'interface est celle du site (index.html, app.js…, copiés dans l'APK), affichée dans une
 * WebView. L'appli y ajoute ce qu'un site ne peut pas faire : lire Instagram avec ta connexion
 * (navigateur caché, voir [Instagram]) et recevoir les partages depuis l'appli Instagram.
 */
class MainActivity : ComponentActivity(), Instagram.Listener {
    private lateinit var web: WebView
    private lateinit var ig: Instagram
    private var ready = false
    private val whenReady = ArrayDeque<() -> Unit>()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var toSave: String? = null
    private var afterLogin: (() -> Unit)? = null
    private var loginRetried: String? = null
    private val prefs by lazy { getSharedPreferences("recettes", MODE_PRIVATE) }

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val saveLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = toSave
        toSave = null
        if (uri == null || text == null) return@registerForActivityResult
        runCatching { contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) } }
            .onSuccess { toast("Sauvegarde enregistrée") }
            .onFailure { toast("Échec de la sauvegarde") }
    }
    private val login = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val next = afterLogin
        afterLogin = null
        if (r.resultCode == RESULT_OK) next?.invoke() else progress(null)
    }

    private val pickCollection = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val id = r.data?.getStringExtra("id")
        val name = r.data?.getStringExtra("name")
        if (r.resultCode == RESULT_OK && id != null && name != null) chooseCollection(id, name) else progress(null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this)
        root.setBackgroundColor(getColor(R.color.bg))
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        ig = Instagram(this, root, this)
        setContentView(root)

        // Bord à bord : l'interface ne passe ni sous la barre d'état ni sous le clavier.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        setupWeb()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.RecettesInsta ? RecettesInsta.back() : false") { handled ->
                    if (handled != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWeb() {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.addJavascriptInterface(AppBridge(), "RecettesAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            // Liens externes (« Ouvrir dans Instagram »…) : dans l'appli Instagram ou le navigateur.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                // Tous types : un .json venu de Drive ou d'un mail n'est pas toujours reconnu comme tel.
                pickFile.launch(Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"))
                return true
            }
        }
        web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/web/index.html")
    }

    /* ---------- Appels depuis l'interface web (window.RecettesAndroid) ---------- */

    private inner class AppBridge {
        @JavascriptInterface fun ready() = runOnUiThread {
            ready = true
            while (whenReady.isNotEmpty()) whenReady.removeFirst()()
        }

        @JavascriptInterface fun print(title: String) = runOnUiThread {
            val name = title.ifBlank { "Recettes" }
            getSystemService(PrintManager::class.java).print(
                name, web.createPrintDocumentAdapter(name),
                PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build(),
            )
        }

        @JavascriptInterface fun saveFile(name: String, content: String) = runOnUiThread {
            toSave = content
            saveLauncher.launch(name)
        }

        @JavascriptInterface fun sync() = runOnUiThread { startSync() }

        @JavascriptInterface fun logout() = runOnUiThread {
            prefs.edit().remove("colId").remove("colName").apply()
            ig.logout { toast("Déconnecté d'Instagram") }
        }
    }

    /* ---------- Partage depuis Instagram ---------- */

    private fun handleIntent(i: Intent?) {
        if (i?.action != Intent.ACTION_SEND) return
        val text = listOfNotNull(i.getStringExtra(Intent.EXTRA_TEXT), i.getStringExtra(Intent.EXTRA_SUBJECT)).joinToString(" ")
        i.action = null // ne pas le retraiter (rotation, retour dans l'appli)
        val m = IG_POST.find(text)
        whenReadyDo {
            if (m == null) toast("Ce partage ne contient pas de lien vers un post Instagram")
            else readPost(m.groupValues[1])
        }
    }

    private fun readPost(code: String) {
        if (ig.busy) { toast("Patiente : une lecture Instagram est en cours"); return }
        progress("Lecture du post…")
        igRun("__RI.post(${q(code)})")
    }

    /* ---------- Synchronisation de la collection ---------- */

    private fun startSync() {
        if (ig.busy) { toast("Synchronisation déjà en cours"); return }
        val id = prefs.getString("colId", null)
        val name = prefs.getString("colName", null)
        if (id != null && name != null) syncCollection(id, name)
        else { progress("Recherche de tes collections…"); igRun("__RI.collections()") }
    }

    private fun syncCollection(id: String, name: String) {
        progress("Synchronisation de « $name »…")
        web.evaluateJavascript("RecettesInsta.knownCodes()") { known ->
            igRun("__RI.collection(${q(id)}, ${q(name)}, ${known?.takeIf { it.startsWith("[") } ?: "[]"})")
        }
    }

    private fun igRun(cmd: String) {
        if (!Instagram.loggedIn()) { askLogin { igRun(cmd) }; return }
        ig.run(cmd)
    }

    private fun askLogin(then: () -> Unit) {
        progress(null)
        afterLogin = then
        login.launch(Intent(this, LoginActivity::class.java))
    }

    /* ---------- Résultats du navigateur Instagram caché ---------- */

    override fun onProgress(text: String) = progress(text)

    override fun onCollections(json: String) {
        progress(null)
        // Liste refusée par Instagram : on choisit la collection dans Instagram même.
        if (json == "null") { openCollectionPicker(); return }
        val arr = JSONArray(json)
        val cols = (0 until arr.length()).map { arr.getJSONObject(it) }
        val labels = cols.map { c ->
            c.getString("name") + (if (c.isNull("n")) "" else " (${c.getInt("n")})")
        } + listOf("Tous mes enregistrements", "Autre : choisir dans Instagram…")
        AlertDialog.Builder(this)
            .setTitle("Quelle collection contient tes recettes ?")
            .setItems(labels.toTypedArray()) { _, which ->
                when {
                    which < cols.size -> chooseCollection(cols[which].getString("id"), cols[which].getString("name"))
                    which == cols.size -> chooseCollection("ALL", "Tous mes enregistrements")
                    else -> openCollectionPicker()
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun openCollectionPicker() {
        pickCollection.launch(Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_PICK, true))
    }

    private fun chooseCollection(id: String, name: String) {
        prefs.edit().putString("colId", id).putString("colName", name).apply()
        syncCollection(id, name)
    }

    override fun onBatch(json: String) { web.evaluateJavascript("RecettesInsta.importPosts($json)", null) }

    override fun onDone(added: Int) {
        loginRetried = null
        web.evaluateJavascript("RecettesInsta.syncDone($added)", null)
    }

    override fun onPost(json: String) {
        loginRetried = null
        web.evaluateJavascript("RecettesInsta.importPost($json)", null)
    }

    override fun onError(message: String, needsLogin: Boolean, command: String) {
        progress(null)
        if (needsLogin && command.isNotEmpty() && loginRetried != command) {
            // Session expirée : on efface les cookies, connexion, puis on relance la même commande.
            loginRetried = command
            ig.logout { askLogin { igRun(command) } }
            return
        }
        if (command.startsWith("__RI.collection(") && "404" in message) {
            prefs.edit().remove("colId").remove("colName").apply() // collection supprimée : on redemandera
        }
        toast(message)
    }

    /* ---------- Utilitaires ---------- */

    private fun whenReadyDo(block: () -> Unit) { if (ready) block() else whenReady.addLast(block) }

    private fun progress(text: String?) {
        if (ready) web.evaluateJavascript("RecettesInsta.progress(${q(text ?: "")})", null)
    }

    private fun toast(msg: String) {
        if (ready) web.evaluateJavascript("RecettesInsta.toast(${q(msg)})", null)
        else Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }

    companion object {
        private val IG_POST = Regex("""instagram\.com/(?:[\w.]+/)?(?:p|reels?|tv)/([\w-]+)""", RegexOption.IGNORE_CASE)
        private fun q(s: String): String = JSONObject.quote(s)
    }
}
