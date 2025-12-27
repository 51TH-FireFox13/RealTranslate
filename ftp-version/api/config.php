<?php
/**
 * Configuration RealTranslate
 * IMPORTANT : Protégez ce fichier avec .htaccess pour qu'il ne soit pas accessible directement
 */

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
    // Vérifier les headers de géolocalisation
    $countryCode = $_SERVER['HTTP_CF_IPCOUNTRY'] ??
                   $_SERVER['HTTP_X_VERCEL_IP_COUNTRY'] ??
                   $_SERVER['HTTP_CLOUDFRONT_VIEWER_COUNTRY'] ?? '';

    // Vérifier la langue acceptée
    $acceptLanguage = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';

    // Si en Chine, utiliser DeepSeek
    if ($countryCode === 'CN' || strpos($acceptLanguage, 'zh-CN') !== false) {
        return 'deepseek';
    }

    return 'openai';
}

// Fonction pour envoyer une réponse JSON
function sendJsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Fonction pour gérer les erreurs
function sendError($message, $statusCode = 500) {
    sendJsonResponse(['error' => $message], $statusCode);
}
