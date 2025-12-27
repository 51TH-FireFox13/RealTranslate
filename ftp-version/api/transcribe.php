<?php
/**
 * Endpoint de transcription audio avec Whisper
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

// Préparer la requête cURL pour Whisper
$ch = curl_init('https://api.openai.com/v1/audio/transcriptions');

// Créer le fichier temporaire pour cURL
$cFile = new CURLFile($audioFile['tmp_name'], $audioFile['type'], 'audio.webm');

// Préparer les données
$postData = [
    'model' => 'whisper-1',
    'file' => $cFile
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
    sendError('Erreur cURL: ' . $error, 500);
}

// Gérer les erreurs API
if ($httpCode !== 200) {
    error_log("Whisper API error: " . $response);
    sendError('Erreur de transcription', $httpCode);
}

// Décoder et renvoyer la réponse
$data = json_decode($response, true);

if (!isset($data['text'])) {
    sendError('Réponse invalide de Whisper', 500);
}

sendJsonResponse([
    'text' => trim($data['text'])
]);
