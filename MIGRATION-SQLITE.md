# Migration JSON → SQLite

## 📋 Vue d'ensemble

Cette migration transforme RealTranslate d'un système de stockage JSON vers une base de données SQLite professionnelle.

### ✅ Avantages

- **Intégrité des données**: Transactions ACID, foreign keys
- **Performances**: Index, requêtes optimisées
- **Fiabilité**: Plus de risque de corruption de fichiers JSON
- **Backups**: Un seul fichier `.db` à sauvegarder
- **Scalabilité**: Prêt pour migration PostgreSQL future

### 📊 Structures migrées

- ✅ **Users** → `backend/realtranslate.db` (table `users`)
- ✅ **Groups** → `backend/realtranslate.db` (tables `groups`, `group_members`)
- ✅ **Messages** → `backend/realtranslate.db` (table `messages`)
- ✅ **Direct Messages** → `backend/realtranslate.db` (table `direct_messages`)
- ✅ **Access Tokens** → `backend/realtranslate.db` (table `access_tokens`)
- ✅ **User Statuses** → `backend/realtranslate.db` (table `user_statuses`)
- ✅ **Archives** → `backend/realtranslate.db` (table `user_archived`)

---

## 🚀 Procédure de migration

### Étape 1: Backup des données actuelles

**IMPORTANT**: Sauvegardez vos données JSON avant de commencer !

```bash
cd /home/user/RealTranslate/backend

# Créer un répertoire de backup
mkdir -p backups/$(date +%Y%m%d_%H%M%S)

# Copier tous les fichiers JSON
cp *.json backups/$(date +%Y%m%d_%H%M%S)/

# Vérifier le backup
ls -lh backups/$(date +%Y%m%d_%H%M%S)/
```

### Étape 2: Installer better-sqlite3 (si pas déjà fait)

```bash
cd /home/user/RealTranslate/backend
npm install better-sqlite3
```

### Étape 3: Exécuter le script de migration

```bash
cd /home/user/RealTranslate/backend
node migrate-to-sqlite.js
```

**Sortie attendue:**
```
🚀 Début de la migration JSON → SQLite
==================================================

📦 Migration des utilisateurs...
   ✅ 5 utilisateurs migrés

📦 Migration des groupes...
   ✅ 3 groupes migrés

📦 Migration des messages de groupe...
   ✓ Groupe abc123: 42 messages
   ✓ Groupe def456: 18 messages
   ✅ 60 messages de groupe migrés

📦 Migration des messages privés...
   ✓ Conversation user1_user2: 15 messages
   ✅ 15 messages privés migrés

📦 Migration des tokens d'accès...
   ✅ 2 tokens migrés

==================================================
✅ Migration terminée avec succès !

📊 Statistiques:
   - Utilisateurs: 5
   - Groupes: 3
   - Tokens: 2

💡 Prochaines étapes:
   1. Vérifier les données dans realtranslate.db
   2. Sauvegarder les fichiers JSON (backup)
   3. Démarrer le serveur avec la nouvelle DB
```

### Étape 4: Vérifier la base de données

**Option A: SQLite CLI**

```bash
sqlite3 backend/realtranslate.db

# Lister les tables
.tables

# Compter les utilisateurs
SELECT COUNT(*) FROM users;

# Vérifier les groupes
SELECT id, name, visibility FROM groups;

# Quitter
.quit
```

**Option B: DB Browser for SQLite** (GUI)

Téléchargez: https://sqlitebrowser.org/

```bash
# Ouvrir avec DB Browser
sqlitebrowser backend/realtranslate.db
```

### Étape 5: Démarrer le serveur

```bash
cd /home/user/RealTranslate/backend

# Mode développement
node server.js

# Ou avec PM2 (production)
pm2 restart realtranslate
pm2 logs realtranslate
```

**Logs attendus:**
```
[INFO] SQLite database initialized
[INFO] Database tables created/verified
[INFO] RealTranslate Backend starting...
[INFO] Server listening on port 3000
```

### Étape 6: Tester les fonctionnalités

1. **Authentification**
   - Login avec utilisateur existant
   - Vérifier le profil

2. **Groupes**
   - Créer un nouveau groupe
   - Envoyer un message
   - Vérifier la traduction

3. **Messages privés**
   - Ouvrir une conversation
   - Envoyer un message
   - Vérifier l'historique

4. **Admin**
   - Panel admin → Utilisateurs
   - Panel admin → Groupes
   - Vérifier les statistiques

---

## 🔧 Rollback (retour JSON)

Si problème détecté, retour arrière possible:

```bash
cd /home/user/RealTranslate/backend

# 1. Arrêter le serveur
pm2 stop realtranslate

# 2. Restaurer les JSON depuis backup
cp backups/YYYYMMDD_HHMMSS/*.json .

# 3. Modifier server.js
sed -i "s|from './auth-sqlite.js'|from './auth.js'|" server.js

# 4. Redémarrer
pm2 restart realtranslate
```

---

## 📂 Structure de la base SQLite

### Tables principales

| Table | Description | Clés |
|-------|-------------|------|
| `users` | Utilisateurs + auth + Stripe | PK: email |
| `groups` | Groupes de discussion | PK: id, FK: creator |
| `group_members` | Membres des groupes | PK: (group_id, user_email) |
| `messages` | Messages groupes | PK: id, FK: group_id |
| `direct_messages` | Messages privés | PK: id |
| `access_tokens` | Jetons d'accès | PK: token |
| `user_archived` | Archives utilisateur | PK: (user_email, item_type, item_id) |
| `user_statuses` | Online/offline | PK: user_email |

### Index créés

```sql
CREATE INDEX idx_messages_group ON messages(group_id, timestamp DESC);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_dm_conversation ON direct_messages(conversation_id, timestamp DESC);
CREATE INDEX idx_dm_users ON direct_messages(from_email, to_email);
```

---

## ⚙️ Configuration avancée

### Backup automatique quotidien

```bash
# Créer script de backup
cat > /home/user/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/user/RealTranslate/backend/backups"
DB_FILE="/home/user/RealTranslate/backend/realtranslate.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_FILE" "$BACKUP_DIR/realtranslate_$DATE.db"

# Garder seulement les 7 derniers backups
ls -t "$BACKUP_DIR"/realtranslate_*.db | tail -n +8 | xargs -r rm

echo "Backup completed: realtranslate_$DATE.db"
EOF

chmod +x /home/user/backup-db.sh

# Ajouter à crontab (tous les jours à 3h)
crontab -l | { cat; echo "0 3 * * * /home/user/backup-db.sh"; } | crontab -
```

### Optimisation SQLite

```sql
-- À exécuter périodiquement
VACUUM;        -- Compacter la DB
ANALYZE;       -- Mettre à jour les statistiques des index
PRAGMA optimize;  -- Optimiser automatiquement
```

### Monitoring taille DB

```bash
# Taille actuelle
ls -lh backend/realtranslate.db

# Détails par table
sqlite3 backend/realtranslate.db "
SELECT
  name,
  COUNT(*) as rows
FROM sqlite_master m
JOIN pragma_table_info(m.name)
GROUP BY name;
"
```

---

## 🐛 Dépannage

### Erreur: "database is locked"

**Cause**: Plusieurs processus accèdent à la DB simultanément.

**Solution**:
```bash
# Vérifier les processus
lsof backend/realtranslate.db

# Arrêter tous les serveurs
pm2 stop all
killall node

# Redémarrer proprement
pm2 start backend/server.js --name realtranslate
```

### Erreur: "no such table: users"

**Cause**: DB pas initialisée correctement.

**Solution**:
```bash
# Supprimer et recréer
rm backend/realtranslate.db
node backend/migrate-to-sqlite.js
```

### Performances lentes

**Solution**:
```bash
sqlite3 backend/realtranslate.db "PRAGMA optimize; VACUUM;"
```

### Corruption détectée

**Solution**:
```bash
# Vérifier l'intégrité
sqlite3 backend/realtranslate.db "PRAGMA integrity_check;"

# Si corrupted, restaurer backup
cp backups/YYYYMMDD_HHMMSS/realtranslate.db backend/
```

---

## 📈 Prochaines étapes

1. **Monitoring**: Ajouter logs des requêtes lentes
2. **Encryption**: Implémenter chiffrement des champs sensibles
3. **Réplication**: Setup master-slave pour HA
4. **Migration PostgreSQL**: Si scale > 10K users

---

## ✅ Checklist de migration

- [ ] Backup des fichiers JSON existants
- [ ] Installation better-sqlite3
- [ ] Exécution migrate-to-sqlite.js
- [ ] Vérification des données migrées
- [ ] Test authentification
- [ ] Test création groupe
- [ ] Test messages groupes
- [ ] Test messages privés
- [ ] Test panel admin
- [ ] Backup automatique configuré
- [ ] Documentation équipe mise à jour

---

## 📞 Support

En cas de problème:
1. Vérifier les logs: `pm2 logs realtranslate`
2. Vérifier l'intégrité DB: `sqlite3 backend/realtranslate.db "PRAGMA integrity_check;"`
3. Consulter les backups JSON
4. Rollback si nécessaire

**Note**: Les fichiers JSON originaux restent en place comme backup de sécurité.
