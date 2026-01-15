# 🔑 Installation des clés API

## 📁 Nouvelle structure

Les **clés API** sont maintenant séparées du fichier de configuration :

```
api/
├── keys.php           ← Vos clés API (NE JAMAIS COMMIT)
├── keys.php.example   ← Template pour les clés
├── config.php         ← Configuration (peut être mis à jour)
└── .gitignore         ← Ignore keys.php
```

---

## ⚡ Installation rapide

### **1. Créer le fichier de clés** (une seule fois)

Via FTP, créez `api/keys.php` avec ce contenu :

```php
<?php
if (!defined('REALTRANSLATE_CONFIG')) {
    http_response_code(403);
    die('Accès interdit');
}

// Vos vraies clés API
define('OPENAI_API_KEY', 'sk-votre-vraie-cle-openai');
define('DEEPSEEK_API_KEY', 'sk-votre-vraie-cle-deepseek');
```

### **2. Ou copier le template**

```bash
# En local
cd api
cp keys.php.example keys.php
nano keys.php  # Éditer avec vos vraies clés
```

Puis upload `keys.php` via FTP.

### **3. Vérifier**

```
https://leuca.fr/translate/api/keys.php
```
→ Doit afficher : **"Accès interdit"** (403)

---

## ✅ Avantages

| Avant | Après |
|-------|-------|
| Clés dans `config.php` | Clés dans `keys.php` |
| Risque de commit des clés | `keys.php` gitignored |
| Conflit Git à chaque pull | Plus de conflit ! |
| Remplacer clés à chaque update | `keys.php` jamais modifié |

---

## 🔄 Mise à jour

### **Mettre à jour config.php**
```bash
git pull
# Puis upload UNIQUEMENT config.php via FTP
# keys.php reste intact !
```

### **Changer une clé API**
Édite `keys.php` directement sur le serveur FTP (une seule fois).

---

## 🔒 Sécurité

✅ **keys.php** :
- Protection contre accès direct (constante REALTRANSLATE_CONFIG)
- Ignoré par Git (.gitignore)
- Jamais commité

✅ **config.php** :
- Peut être mis à jour sans toucher aux clés
- Commité sur Git
- Include keys.php de manière sécurisée

---

## 🎯 Checklist première installation

- [ ] Créer `api/keys.php` avec vos vraies clés
- [ ] Upload `keys.php` via FTP
- [ ] Tester : `https://leuca.fr/translate/api/keys.php` → 403
- [ ] Upload tous les autres fichiers
- [ ] Tester l'application

---

## 🆘 Problèmes

### "Erreur : keys.php not found"
→ Créez le fichier `api/keys.php` sur le serveur

### "Accès interdit" sur config.php
→ Normal ! C'est la protection

### Conflit Git sur keys.php
→ Impossible, il est dans .gitignore

---

**🎉 Fini ! Vos clés sont maintenant isolées et protégées.**
