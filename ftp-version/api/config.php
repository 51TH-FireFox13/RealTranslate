<?php
/**
 * Configuration RealTranslate
 * Protection intégrée contre l'accès direct
 */

// Interdire l'accès direct à ce fichier
if (basename($_SERVER['PHP_SELF']) === 'config.php') {
    http_response_code(403);
    die('Accès interdit');
}

// Clés API - À REMPLIR avec vos vraies clés
define('OPENAI_API_KEY', 'sk-votre-cle-openai-ici');
define('DEEPSEEK_API_KEY', 'sk-votre-cle-deepseek-ici');

// Configuration
define('ALLOWED_ORIGINS', [
    'https://leuca.fr',
    'https://www.leuca.fr',
    'http://localhost',
    'http://127.0.0.1'
]);

// Headers CORS
function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, ALLOWED_ORIGINS) || strpos($origin, 'leuca.fr') !== false) {
        header("Access-Control-Allow-Origin: $origin");
    }

    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    header("Access-Control-Max-Age: 3600");

    // Gérer les requêtes OPTIONS (preflight)
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// Fonction pour détecter la région
function detectRegion() {
    // Log pour debug
    error_log("Detect Region - Country: " . ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? 'none'));
    error_log("Accept-Language: " . ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'none'));

    // Vérifier UNIQUEMENT les headers de géolocalisation (pas Accept-Language)
    $countryCode = $_SERVER['HTTP_CF_IPCOUNTRY'] ??
                   $_SERVER['HTTP_X_VERCEL_IP_COUNTRY'] ??
                   $_SERVER['HTTP_CLOUDFRONT_VIEWER_COUNTRY'] ?? '';

    // Si en Chine, utiliser DeepSeek
    if ($countryCode === 'CN') {
        error_log("Provider: deepseek (Chine détectée)");
        return 'deepseek';
    }

    error_log("Provider: openai (défaut)");
    return 'openai';
}

// Fonction pour envoyer une réponse JSON
function sendJsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Fonction pour gérer les erreurs
function sendError($message, $statusCode = 500) {
    sendJsonResponse(['error' => $message], $statusCode);
}
