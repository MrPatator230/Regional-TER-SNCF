-- Schéma Ferrovia Connect pour inscription / connexion (sessions côté serveur)
-- Compatible MySQL 8+

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Base de données
CREATE DATABASE IF NOT EXISTS ferrovia_bfc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE ferrovia_bfc;

-- Utilisateurs (référencé par l’API register + login)
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('client','agent','admin') NOT NULL DEFAULT 'client',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemple (remplacer par un hash bcrypt réel)
-- INSERT INTO users (first_name, last_name, birth_date, email, password_hash, role)
-- VALUES ('Jean', 'Dupont', '2000-01-01', 'jean.dupont@example.com', '$2a$10$examplehashexamplehashexampleha', 'client');

-- Sessions (utilisées par l’API login + middleware requireRole)
CREATE TABLE IF NOT EXISTS sessions (
  -- Token hexadécimal (64 chars). Stocké en ASCII binaire pour égalité stricte et index léger
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gares (stations)
CREATE TABLE IF NOT EXISTS stations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  -- 'urbaine' => fenêtre 12h, 'ville' => fenêtre 30min
  station_type ENUM('urbaine','ville') NOT NULL,
  services JSON NOT NULL,
  platforms JSON NOT NULL,
  transports JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stations_name (name),
  KEY idx_stations_type (station_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Matériel roulant
CREATE TABLE IF NOT EXISTS materiel_roulant (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  technical_name VARCHAR(190) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  image LONGBLOB NULL,
  image_mime VARCHAR(100) NULL,
  train_type VARCHAR(100) NOT NULL,
  serial_number CHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_materiel_serial (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Données de configuration région (singleton)
CREATE TABLE IF NOT EXISTS `région_data` (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialise la ligne unique si absente
INSERT IGNORE INTO `région_data` (id, data) VALUES (1, JSON_OBJECT());

-- Lignes (relations entre gares + type d’exploitation)
CREATE TABLE IF NOT EXISTS lignes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  depart_station_id INT UNSIGNED NOT NULL,
  arrivee_station_id INT UNSIGNED NOT NULL,
  exploitation_type ENUM('voyageur','fret','exploitation') NOT NULL,
  desservies JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lignes_depart (depart_station_id),
  KEY idx_lignes_arrivee (arrivee_station_id),
  CONSTRAINT fk_lignes_depart FOREIGN KEY (depart_station_id) REFERENCES stations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lignes_arrivee FOREIGN KEY (arrivee_station_id) REFERENCES stations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perturbations (travaux, arrêts temporaires, modifications de parcours)
CREATE TABLE IF NOT EXISTS perturbations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ligne_id INT UNSIGNED NOT NULL,
  type ENUM('travaux','arret_temporaire','modif_parcours') NOT NULL,
  titre VARCHAR(190) NOT NULL,
  description TEXT NULL,
  date_debut DATETIME NULL,
  date_fin DATETIME NULL,
  data JSON NOT NULL DEFAULT (JSON_OBJECT()), -- champs spécifiques (ex: horaires impactés, arrêts modifiés, etc.)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_perturbations_ligne (ligne_id),
  KEY idx_perturbations_type (type),
  KEY idx_perturbations_dates (date_debut, date_fin),
  CONSTRAINT fk_perturbations_ligne FOREIGN KEY (ligne_id) REFERENCES lignes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Structure JSON recommandée pour perturbations.data
-- {
--   "jours": ["Lun","Mar",...],                    -- Jours d'effet (travaux)
--   "horaire_interruption": { "debut":"HH:MM", "fin":"HH:MM" }, -- Plage horaire (travaux)
--   "exclude_schedules": [1,2,3],                    -- IDs de sillons à ne pas afficher (entre les heures / jours)
--   "banner_all": true,                               -- Afficher un bandeau sur tous les sillons de la ligne
--   "banner_days_before": 2,                          -- Nombre de jours d'affichage avant date_debut (si banner_all)
--   "substitution_autocar": true,                     -- Active l'affichage des sillons de substitution
--   "substitution_sillons": [10,11],                  -- IDs des sillons marqués substitution à afficher
--   "substitution_details": "Texte libre",           -- Détails éventuels
--   "modification": {                                  -- Données de modification de parcours (si type=modif_parcours)
--     "service_id": 0,
--     "original": { /* route originale */ },
--     "updated": { /* route modifiée */ }
--   }
-- }
-- Remarque: pas de migration requise, la colonne JSON data reste générique.

-- Informations d'affichage gares par ligne
CREATE TABLE IF NOT EXISTS station_display_infos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ligne_id INT UNSIGNED NOT NULL,
  titre VARCHAR(190) NULL,
  message TEXT NOT NULL,
  priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  date_debut DATETIME NULL,
  date_fin DATETIME NULL,
  data JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sdi_ligne (ligne_id),
  KEY idx_sdi_dates (date_debut,date_fin),
  CONSTRAINT fk_sdi_ligne FOREIGN KEY (ligne_id) REFERENCES lignes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gestion Info Trafic
CREATE TABLE IF NOT EXISTS infos_trafics (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('information','annulation','attention','travaux') NOT NULL,
  titre VARCHAR(190) NOT NULL,
  contenu TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_infos_trafics_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gestion Evenements
CREATE TABLE IF NOT EXISTS evenements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  titre VARCHAR(190) NOT NULL,
  duree VARCHAR(100) NULL,
  lien VARCHAR(255) NULL,
  description TEXT NULL,
  highlight TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_evenements_highlight (highlight),
  KEY idx_evenements_lien (lien)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nouveaux articles (promotions / focus)
CREATE TABLE IF NOT EXISTS articles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(190) NOT NULL,
  titre VARCHAR(190) NOT NULL,
  resume VARCHAR(255) NULL,
  contenu TEXT NULL,
  image_path VARCHAR(255) NULL,
  homepage TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_articles_slug (slug),
  KEY idx_articles_homepage (homepage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
