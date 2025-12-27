<?php
/**
 * Endpoint de transcription audio avec Whisper
 * Détection améliorée du chinois
 */

require_once 'config.php';

setCorsHeaders();

// Vérifier que c'est une requête POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Méthode non autorisée', 405);
}

// Vérifier qu'un fichier audio a été uploadé
if (!isset($_FILES['audio']) || $_FILES['audio']['error'] !== UPLOAD_ERR_OK) {
    sendError('Aucun fichier audio fourni', 400);
}

$audioFile = $_FILES['audio'];
$language = $_POST['language'] ?? null;

/**
 * Fonction pour détecter si le texte est probablement du pinyin
 */
function isProbablyPinyin($text) {
    // Patterns pinyin courants
    $pinyinPatterns = [
        '/\bni\s*hao\b/i',
        '/\bxie\s*xie\b/i',
        '/\bzai\s*jian\b/i',
        '/\bbu\s*ke\s*qi\b/i',
        '/\bdui\s*bu\s*qi\b/i',
        '/\bzen\s*me\s*yang\b/i',
        '/\bni\s*hao\s*ma\b/i',
        '/\bwo\s*ai\s*ni\b/i',
        '/\bzen\s*me\s*le\b/i'
    ];

    foreach ($pinyinPatterns as $pattern) {
        if (preg_match($pattern, $text)) {
            return true;
        }
    }

    // Vérifier si le texte contient beaucoup de syllabes pinyin
    // (caractéristique : voyelles avec consonnes chinoises)
    $chineseConsonants = '(b|p|m|f|d|t|n|l|g|k|h|j|q|x|zh|ch|sh|r|z|c|s|w|y)';
    $chineseVowels = '(a|o|e|i|u|v|ai|ei|ui|ao|ou|iu|ie|ve|er|an|en|in|un|ang|eng|ing|ong)';
    $pinyinSyllable = $chineseConsonants . '?' . $chineseVowels . '[1-5]?';

    preg_match_all('/' . $pinyinSyllable . '/i', $text, $matches);
    $syllableCount = count($matches[0]);
    $wordCount = str_word_count($text);

    // Si plus de 60% des mots ressemblent à du pinyin
    if ($wordCount > 0 && ($syllableCount / $wordCount) > 0.6) {
        return true;
    }

    return false;
}

/**
 * Fonction pour transcrire avec Whisper
 */
function transcribeWithWhisper($audioFile, $language = null, $attempt = 1) {
    // Préparer la requête cURL pour Whisper
    $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');

    // Créer le fichier temporaire pour cURL
    $cFile = new CURLFile($audioFile['tmp_name'], $audioFile['type'], 'audio.webm');

    // Préparer les données
    $postData = [
        'model' => 'whisper-1',
        'file' => $cFile,
        'temperature' => 0.0,  // Réduire les hallucinations
        'prompt' => ''  // Pas de prompt pour éviter l'ajout de contenu
    ];

    if ($language) {
        $postData['language'] = $language;
    }

    // Configuration cURL
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . OPENAI_API_KEY
        ]
    ]);

    // Exécuter la requête
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    // Gérer les erreurs cURL
    if ($error) {
        throw new Exception('Erreur cURL: ' . $error);
    }

    // Gérer les erreurs API
    if ($httpCode !== 200) {
        error_log("Whisper API error (attempt $attempt): " . $response);
        throw new Exception('Erreur de transcription');
    }

    // Décoder la réponse
    $data = json_decode($response, true);

    if (!isset($data['text'])) {
        throw new Exception('Réponse invalide de Whisper');
    }

    return trim($data['text']);
}

try {
    // Première tentative de transcription (auto-détection)
    $transcription = transcribeWithWhisper($audioFile, $language, 1);

    // Vérifier si la transcription contient des caractères chinois
    $hasChineseChars = preg_match('/[\x{4e00}-\x{9fff}]/u', $transcription);

    // Si pas de caractères chinois MAIS ressemble à du pinyin
    // → Retenter en forçant le chinois
    if (!$hasChineseChars && isProbablyPinyin($transcription)) {
        error_log("Pinyin détecté : '$transcription' - Retranscription en chinois...");

        // Retranscrire en forçant le chinois
        $transcription = transcribeWithWhisper($audioFile, 'zh', 2);

        error_log("Transcription chinoise : '$transcription'");
    }

    sendJsonResponse([
        'text' => $transcription
    ]);

} catch (Exception $e) {
    error_log('Transcription error: ' . $e->getMessage());
    sendError($e->getMessage(), 500);
}
