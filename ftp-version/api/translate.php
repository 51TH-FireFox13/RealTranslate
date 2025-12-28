<?php
/**
 * Endpoint de traduction avec OpenAI / DeepSeek
 */

require_once 'config.php';

setCorsHeaders();

// Vérifier que c'est une requête POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Méthode non autorisée', 405);
}

// Lire les données JSON
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['text']) || !isset($input['targetLanguage'])) {
    sendError('Texte et langue cible requis', 400);
}

$text = $input['text'];
$targetLanguage = $input['targetLanguage'];
$provider = $input['provider'] ?? detectRegion();

// Déterminer l'API à utiliser
if ($provider === 'deepseek') {
    $apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    $apiKey = DEEPSEEK_API_KEY;
    $model = 'deepseek-chat';
} else {
    $apiUrl = 'https://api.openai.com/v1/chat/completions';
    $apiKey = OPENAI_API_KEY;
    $model = 'gpt-4o-mini';
}

// Déterminer les langues source et cible
$sourceLangName = $targetLanguage === 'zh' ? 'français' : '中文（简体中文）';
$targetLangName = $targetLanguage === 'zh' ? '中文（简体中文）' : 'français';

// Log pour debug
error_log("Translation Request - Source: $sourceLangName → Target: $targetLangName");
error_log("Original text: " . substr($text, 0, 100));

// Préparer le payload
$payload = [
    'model' => $model,
    'temperature' => 0.2,  // Réduire pour plus de précision
    'messages' => [
        [
            'role' => 'system',
            'content' => "Tu es un traducteur professionnel $sourceLangName-$targetLangName. Traduis DIRECTEMENT et UNIQUEMENT en $targetLangName. Ne passe PAS par une langue intermédiaire. Réponds SEULEMENT avec la traduction exacte, sans aucune explication ni commentaire."
        ],
        [
            'role' => 'user',
            'content' => $text
        ]
    ]
];

// Configuration cURL
$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);

// Exécuter la requête
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Gérer les erreurs cURL
if ($error) {
    sendError('Erreur cURL: ' . $error, 500);
}

// Gérer les erreurs API
if ($httpCode !== 200) {
    error_log("Translation API error ($provider): " . $response);
    sendError('Erreur de traduction', $httpCode);
}

// Décoder et extraire la traduction
$data = json_decode($response, true);

if (!isset($data['choices'][0]['message']['content'])) {
    sendError('Réponse invalide de l\'API', 500);
}

$translatedText = trim($data['choices'][0]['message']['content']);

// Log de la traduction retournée
error_log("Translated text: " . substr($translatedText, 0, 100));
error_log("Has chinese chars: " . (preg_match('/[\x{4e00}-\x{9fff}]/u', $translatedText) ? 'YES' : 'NO'));

sendJsonResponse([
    'translatedText' => $translatedText,
    'provider' => $provider
]);
