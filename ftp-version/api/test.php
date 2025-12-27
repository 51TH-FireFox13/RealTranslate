<?php
/**
 * Script de test pour vérifier l'installation
 * Accès : https://leuca.fr/translate/api/test.php
 */

// Configuration d'affichage
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/html; charset=utf-8');

echo "<h1>🧪 Test d'installation RealTranslate</h1>";

// Test 1 : PHP Version
echo "<h2>1. Version PHP</h2>";
$phpVersion = phpversion();
echo "Version PHP : <strong>$phpVersion</strong><br>";
if (version_compare($phpVersion, '7.4', '>=')) {
    echo "✅ Version PHP OK (>= 7.4)<br>";
} else {
    echo "⚠️ Version PHP trop ancienne (recommandé >= 7.4)<br>";
}

// Test 2 : Extensions PHP
echo "<h2>2. Extensions PHP</h2>";
$requiredExtensions = ['curl', 'json', 'fileinfo'];
foreach ($requiredExtensions as $ext) {
    if (extension_loaded($ext)) {
        echo "✅ Extension <strong>$ext</strong> : Activée<br>";
    } else {
        echo "❌ Extension <strong>$ext</strong> : Manquante<br>";
    }
}

// Test 3 : Configuration PHP
echo "<h2>3. Configuration PHP</h2>";
echo "upload_max_filesize : <strong>" . ini_get('upload_max_filesize') . "</strong><br>";
echo "post_max_size : <strong>" . ini_get('post_max_size') . "</strong><br>";
echo "max_execution_time : <strong>" . ini_get('max_execution_time') . "s</strong><br>";

// Test 4 : config.php
echo "<h2>4. Fichier config.php</h2>";
if (file_exists('config.php')) {
    echo "✅ Fichier config.php : Trouvé<br>";

    require_once 'config.php';

    // Vérifier les clés API (sans les afficher)
    if (defined('OPENAI_API_KEY')) {
        $key = OPENAI_API_KEY;
        if ($key && $key !== 'sk-votre-cle-openai-ici') {
            echo "✅ OPENAI_API_KEY : Configurée (sk-..." . substr($key, -4) . ")<br>";
        } else {
            echo "⚠️ OPENAI_API_KEY : Non configurée (utilise la valeur par défaut)<br>";
        }
    } else {
        echo "❌ OPENAI_API_KEY : Non définie<br>";
    }

    if (defined('DEEPSEEK_API_KEY')) {
        $key = DEEPSEEK_API_KEY;
        if ($key && $key !== 'sk-votre-cle-deepseek-ici') {
            echo "✅ DEEPSEEK_API_KEY : Configurée (sk-..." . substr($key, -4) . ")<br>";
        } else {
            echo "⚠️ DEEPSEEK_API_KEY : Non configurée (optionnel)<br>";
        }
    } else {
        echo "❌ DEEPSEEK_API_KEY : Non définie<br>";
    }
} else {
    echo "❌ Fichier config.php : Non trouvé<br>";
}

// Test 5 : Endpoints
echo "<h2>5. Endpoints disponibles</h2>";
$endpoints = [
    'detect-region.php' => 'Détection région',
    'transcribe.php' => 'Transcription Whisper',
    'translate.php' => 'Traduction',
    'speak.php' => 'TTS'
];

foreach ($endpoints as $file => $desc) {
    if (file_exists($file)) {
        echo "✅ <strong>$file</strong> : $desc - Présent<br>";
    } else {
        echo "❌ <strong>$file</strong> : $desc - Manquant<br>";
    }
}

// Test 6 : Protection .htaccess
echo "<h2>6. Protection .htaccess</h2>";
if (file_exists('.htaccess')) {
    echo "✅ Fichier .htaccess : Présent<br>";
    echo "⚠️ Testez la protection de config.php : <a href='config.php' target='_blank'>Accéder à config.php</a><br>";
    echo "→ Vous devriez avoir une erreur 403 (Forbidden)<br>";
} else {
    echo "❌ Fichier .htaccess : Manquant<br>";
}

// Test 7 : Détection région
echo "<h2>7. Test détection région</h2>";
if (file_exists('config.php')) {
    require_once 'config.php';
    $provider = detectRegion();
    echo "Provider détecté : <strong>$provider</strong><br>";
    if ($provider === 'openai') {
        echo "ℹ️ Vous êtes en dehors de la Chine → OpenAI<br>";
    } else {
        echo "ℹ️ Vous êtes en Chine → DeepSeek<br>";
    }
}

// Test 8 : Permissions fichiers
echo "<h2>8. Permissions fichiers</h2>";
$files = ['config.php', 'transcribe.php', 'translate.php', 'speak.php', 'detect-region.php'];
foreach ($files as $file) {
    if (file_exists($file)) {
        $perms = substr(sprintf('%o', fileperms($file)), -4);
        echo "Fichier <strong>$file</strong> : Permissions $perms<br>";
    }
}

// Résumé
echo "<h2>✅ Résumé</h2>";
echo "<p>Si tous les tests sont ✅, votre installation est prête !</p>";
echo "<p><a href='../index.html' style='background:#00ff9d;color:#000;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;'>🚀 Tester l'application</a></p>";

// Note de sécurité
echo "<hr>";
echo "<p style='color:orange;'>⚠️ SÉCURITÉ : Supprimez ce fichier test.php après vérification !</p>";
