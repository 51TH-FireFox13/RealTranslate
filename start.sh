#!/bin/bash

# Script de démarrage RealTranslate
# Auteur: RealTranslate Team

echo "🚀 RealTranslate - Démarrage"
echo "=============================="

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé. Installez-le depuis https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Aller dans le dossier backend
cd backend

# Vérifier si .env existe
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  Fichier .env manquant !"
    echo "Création du fichier .env depuis .env.example..."
    cp .env.example .env
    echo ""
    echo "📝 IMPORTANT: Éditez le fichier backend/.env et ajoutez vos clés API :"
    echo "   - OPENAI_API_KEY=sk-..."
    echo "   - DEEPSEEK_API_KEY=sk-..."
    echo ""
    echo "Appuyez sur ENTER après avoir configuré vos clés API..."
    read
fi

# Vérifier si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Erreur lors de l'installation des dépendances"
        exit 1
    fi
    echo "✅ Dépendances installées"
fi

# Démarrer le serveur
echo ""
echo "🌐 Démarrage du serveur..."
echo "📍 URL: http://localhost:3000"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter le serveur"
echo ""

npm start
