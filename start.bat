@echo off
REM Script de démarrage RealTranslate (Windows)
REM Auteur: RealTranslate Team

echo 🚀 RealTranslate - Démarrage
echo ==============================

REM Vérifier si Node.js est installé
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js n'est pas installé. Installez-le depuis https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js installé

REM Aller dans le dossier backend
cd backend

REM Vérifier si .env existe
if not exist .env (
    echo.
    echo ⚠️  Fichier .env manquant !
    echo Création du fichier .env depuis .env.example...
    copy .env.example .env
    echo.
    echo 📝 IMPORTANT: Éditez le fichier backend\.env et ajoutez vos clés API :
    echo    - OPENAI_API_KEY=sk-...
    echo    - DEEPSEEK_API_KEY=sk-...
    echo.
    echo Appuyez sur une touche après avoir configuré vos clés API...
    pause
)

REM Vérifier si node_modules existe
if not exist node_modules (
    echo 📦 Installation des dépendances...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Erreur lors de l'installation des dépendances
        pause
        exit /b 1
    )
    echo ✅ Dépendances installées
)

REM Démarrer le serveur
echo.
echo 🌐 Démarrage du serveur...
echo 📍 URL: http://localhost:3000
echo.
echo Appuyez sur Ctrl+C pour arrêter le serveur
echo.

npm start
