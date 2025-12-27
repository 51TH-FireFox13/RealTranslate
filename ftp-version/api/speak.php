<?php
/**
 * Endpoint TTS (Text-to-Speech) avec OpenAI
 */

require_once 'config.php';

setCorsHeaders();

// Vérifier que c'est une requête POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Méthode non autorisée', 405);
}

// Lire les données JSON
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['text'])) {
    sendError('Texte requis', 400);
}

$text = $input['text'];
$voice = $input['voice'] ?? 'nova';

// Log pour debug
error_log("TTS Request - Voice: $voice, Text: " . substr($text, 0, 100));

// Préparer le payload
$payload = [
    'model' => 'tts-1',
    'voice' => $voice, // nova, alloy, echo, fable, onyx, shimmer
    'input' => $text,
    'speed' => 1.0
];

// Configuration cURL
$ch = curl_init('https://api.openai.com/v1/audio/speech');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . OPENAI_API_KEY,
        'Content-Type: application/json'
    ]
]);

// Exécuter la requête
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$error = curl_error($ch);
curl_close($ch);

// Gérer les erreurs cURL
if ($error) {
    sendError('Erreur cURL: ' . $error, 500);
}

// Gérer les erreurs API
if ($httpCode !== 200) {
    error_log("TTS API error: " . substr($response, 0, 500));
    sendError('Erreur TTS', $httpCode);
}

// Renvoyer l'audio directement
header('Content-Type: audio/mpeg');
header('Content-Length: ' . strlen($response));
echo $response;
exit;
