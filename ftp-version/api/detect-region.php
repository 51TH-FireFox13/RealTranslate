<?php
/**
 * Endpoint de détection de région
 */

require_once 'config.php';

setCorsHeaders();

// Vérifier que c'est une requête GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Méthode non autorisée', 405);
}

$provider = detectRegion();

sendJsonResponse([
    'provider' => $provider
]);
