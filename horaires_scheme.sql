-- ===================================================================
-- Script d'INSTALLATION INITIALE de la base "horaires"
-- (à exécuter sur un serveur sans base pré-existante ou vide)
-- ===================================================================
-- Caractéristiques principales :
--   * Tables normalisées (stations, lines, sillons, stops, variantes, inclusions / exclusions)
--   * Bitmask jours (bit0=Lun ... bit6=Dim)
--   * Arrêts normalisés + vue JSON de compatibilité
--   * Variantes quotidiennes (retard / suppression / modification)
--   * Procédures utilitaires de création / mise à jour
--   * Aucun DROP destructif (sauf sur objets pour lesquels MySQL n'offre pas IF NOT EXISTS)
--     => Ré-exécution possible après nettoyage manuel ; pour évolution préférer migrations.
-- ===================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `horaires` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `horaires`;

-- ===================================================================
-- TABLE : stations
-- ===================================================================
CREATE TABLE IF NOT EXISTS `stations` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(190) NOT NULL,
  `slug`        VARCHAR(190) GENERATED ALWAYS AS (LOWER(REPLACE(REPLACE(`name`,' ','-'),'"',''))) VIRTUAL,
  `region`      VARCHAR(120) NULL,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_station_name` (`name`),
  KEY `idx_station_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- TABLE : lines  (nom réservé => toujours quote avec backticks)
-- ===================================================================
CREATE TABLE IF NOT EXISTS `lines` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                 VARCHAR(40) NULL,
  `depart_station_id`    INT UNSIGNED NOT NULL,
  `arrivee_station_id`   INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) GENERATED ALWAYS AS (CONCAT('Ligne ',IFNULL(`code`,''),' ',`depart_station_id`,'-',`arrivee_station_id`)) VIRTUAL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`),
  KEY `idx_line_route` (`depart_station_id`, `arrivee_station_id`),
  CONSTRAINT `fk_lines_depart`  FOREIGN KEY (`depart_station_id`)  REFERENCES `stations`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lines_arrivee` FOREIGN KEY (`arrivee_station_id`) REFERENCES `stations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- TABLE : sillons (ex-"schedules")
-- ===================================================================
-- NOTE sur stops_json (snapshot des arrêts) :
--   Chaque élément du tableau JSON contient au minimum les champs suivants :
--     - station_name      : nom de la gare desservie
--     - arrival_time      : heure d'arrivée au format HH:MM ou NULL
--     - departure_time    : heure de départ au format HH:MM ou NULL
--     - dwell_minutes     : temps d'arrêt en minutes (arrivée->départ), NULL si non calculable
--   La valeur est synchronisée automatiquement par les triggers via
--   la procédure rebuild_schedule_stops_json().
CREATE TABLE IF NOT EXISTS `sillons` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ligne_id`                 INT UNSIGNED NULL,
  `train_number`             VARCHAR(20) NULL,
  `train_type`               VARCHAR(50) NULL,
  `rolling_stock`            VARCHAR(100) NULL,
  `departure_station_id`     INT UNSIGNED NOT NULL,
  `arrival_station_id`       INT UNSIGNED NOT NULL,
  `departure_time`           TIME NOT NULL,
  `arrival_time`             TIME NOT NULL,
  `days_mask`                TINYINT UNSIGNED NOT NULL DEFAULT 31,
  `days_mask_list`           VARCHAR(32) DEFAULT NULL,
  `flag_holidays`            TINYINT(1) NOT NULL DEFAULT 0,
  `flag_sundays`             TINYINT(1) NOT NULL DEFAULT 0,
  `flag_custom`              TINYINT(1) NOT NULL DEFAULT 0,
  `stops_json`               JSON NOT NULL DEFAULT ('[]'),
  `stops_signature`          VARCHAR(700) NULL,
  `is_substitution`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Indique si ce sillon peut être utilisé comme substitution pendant les travaux',
  `created_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`),
  KEY `idx_sillon_line` (`ligne_id`),
  KEY `idx_sillon_train_number` (`train_number`),
  KEY `idx_sillon_dep` (`departure_station_id`, `departure_time`),
  KEY `idx_sillon_arr` (`arrival_station_id`, `arrival_time`),
  KEY `idx_sillon_route_time` (`departure_station_id`, `arrival_station_id`, `departure_time`),
  KEY `idx_sillon_signature` (`stops_signature`),
  CONSTRAINT `fk_sillons_line`   FOREIGN KEY (`ligne_id`)             REFERENCES `lines`(`id`)     ON DELETE SET NULL,
  CONSTRAINT `fk_sillons_depart` FOREIGN KEY (`departure_station_id`) REFERENCES `stations`(`id`)  ON DELETE RESTRICT,
  CONSTRAINT `fk_sillons_arr`    FOREIGN KEY (`arrival_station_id`)   REFERENCES `stations`(`id`)  ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vue de compatibilité avec l’application existante (schedules ↔ sillons)
CREATE OR REPLACE VIEW `schedules` AS SELECT * FROM `sillons`;

-- ===================================================================
-- TABLES : dates custom (include / exclude)
-- ===================================================================
CREATE TABLE IF NOT EXISTS `schedule_custom_include` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id` INT UNSIGNED NOT NULL,
  `date`        DATE NOT NULL,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_schedule_date_inc` (`schedule_id`,`date`),
  KEY `idx_include_date` (`date`),
  CONSTRAINT `fk_inc_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `sillons`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `schedule_custom_exclude` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id` INT UNSIGNED NOT NULL,
  `date`        DATE NOT NULL,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_schedule_date_exc` (`schedule_id`,`date`),
  KEY `idx_exclude_date` (`date`),
  CONSTRAINT `fk_exc_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `sillons`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- TABLE : schedule_stops (référence désormais sillons.id)
-- ===================================================================
CREATE TABLE IF NOT EXISTS `schedule_stops` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id`    INT UNSIGNED NOT NULL,
  `stop_order`     SMALLINT UNSIGNED NOT NULL,
  `station_id`     INT UNSIGNED NOT NULL,
  `arrival_time`   TIME NULL,
  `departure_time` TIME NULL,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_schedule_order` (`schedule_id`,`stop_order`),
  KEY `idx_sched_station` (`schedule_id`,`station_id`),
  CONSTRAINT `fk_stop_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `sillons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stop_station`  FOREIGN KEY (`station_id`)  REFERENCES `stations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- TABLE : schedule_platforms (attribution des quais par gare)
-- ===================================================================
CREATE TABLE IF NOT EXISTS `schedule_platforms` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id`   INT UNSIGNED NOT NULL,
  `station_id`    INT UNSIGNED NOT NULL,
  `platform`      VARCHAR(40) NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_sched_station` (`schedule_id`,`station_id`),
  KEY `idx_station` (`station_id`),
  CONSTRAINT `fk_platform_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `sillons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_platform_station`  FOREIGN KEY (`station_id`)  REFERENCES `stations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- VUE : schedule_stops_json (compat JSON agrégé)
-- ===================================================================
CREATE OR REPLACE VIEW `schedule_stops_json` AS
SELECT id AS schedule_id, stops_json FROM `sillons`;

-- ===================================================================
-- FONCTION : fn_schedule_stops_json
-- ===================================================================
DROP FUNCTION IF EXISTS fn_schedule_stops_json; -- nécessaire (pas IF NOT EXISTS)
DELIMITER $$
CREATE FUNCTION fn_schedule_stops_json(p_schedule_id INT UNSIGNED)
RETURNS JSON DETERMINISTIC
BEGIN
  RETURN (
    SELECT COALESCE(
      CONCAT('[', GROUP_CONCAT(
        JSON_OBJECT(
          'station_name', stn.name,
          'arrival_time', DATE_FORMAT(st.arrival_time,'%H:%i'),
          'departure_time', DATE_FORMAT(st.departure_time,'%H:%i'),
          'dwell_minutes', CASE
            WHEN st.arrival_time IS NULL OR st.departure_time IS NULL THEN NULL
            ELSE GREATEST(0, (TIME_TO_SEC(st.departure_time) - TIME_TO_SEC(st.arrival_time)) DIV 60)
          END
        ) ORDER BY st.stop_order SEPARATOR ','), ']'),
      JSON_ARRAY()
    )
    FROM schedule_stops st
    JOIN stations stn ON stn.id = st.station_id
    WHERE st.schedule_id = p_schedule_id
  );
END $$
DELIMITER ;

-- ===================================================================
-- TABLE : schedule_daily_variants (référence sillons)
-- ===================================================================
CREATE TABLE IF NOT EXISTS `schedule_daily_variants` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id`              INT UNSIGNED NOT NULL,
  `date`                     DATE NOT NULL,
  `type`                     ENUM('retard','suppression','modification') NOT NULL,
  `delay_from_station_id`    INT UNSIGNED NULL,
  `delay_minutes`            SMALLINT UNSIGNED NULL,
  `cause`                    TEXT NULL,
  `mod_departure_station_id` INT UNSIGNED NULL,
  `mod_arrival_station_id`   INT UNSIGNED NULL,
  `mod_departure_time`       TIME NULL,
  `mod_arrival_time`         TIME NULL,
  `removed_stops`            JSON NULL,
  `snapshot_original`        JSON NULL,
  `snapshot_modified`        JSON NULL,
  `created_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`),
  UNIQUE KEY `u_schedule_date_variant` (`schedule_id`,`date`),
  KEY `idx_variant_date` (`date`),
  KEY `idx_variant_type` (`type`),
  CONSTRAINT `fk_variant_schedule`    FOREIGN KEY (`schedule_id`)              REFERENCES `sillons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_variant_delay_st`    FOREIGN KEY (`delay_from_station_id`)    REFERENCES `stations`(`id`)  ON DELETE SET NULL,
  CONSTRAINT `fk_variant_mod_dep_st`  FOREIGN KEY (`mod_departure_station_id`) REFERENCES `stations`(`id`)  ON DELETE SET NULL,
  CONSTRAINT `fk_variant_mod_arr_st`  FOREIGN KEY (`mod_arrival_station_id`)   REFERENCES `stations`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- VUE : schedules_full (vue consolidée) basée sur sillons
-- ===================================================================
CREATE OR REPLACE VIEW `schedules_full` AS
SELECT s.id,
       s.ligne_id,
       s.train_number,
       s.train_type,
       s.rolling_stock,
       ds.name  AS departure_station,
       as2.name AS arrival_station,
       s.departure_time,
       s.arrival_time,
       s.days_mask,
       s.flag_holidays,
       s.flag_sundays,
       s.flag_custom,
       ssj.stops_json
FROM `sillons` s
JOIN stations ds  ON ds.id  = s.departure_station_id
JOIN stations as2 ON as2.id = s.arrival_station_id
LEFT JOIN schedule_stops_json ssj ON ssj.schedule_id = s.id;

-- ===================================================================
-- FONCTION utilitaire : fn_days_mask
-- ===================================================================
DROP FUNCTION IF EXISTS fn_days_mask;
DELIMITER $$
CREATE FUNCTION fn_days_mask(
  p_lun TINYINT, p_mar TINYINT, p_mer TINYINT, p_jeu TINYINT, p_ven TINYINT, p_sam TINYINT, p_dim TINYINT
) RETURNS TINYINT DETERMINISTIC
BEGIN
  RETURN (IF(p_lun,1,0) | IF(p_mar,2,0) | IF(p_mer,4,0) | IF(p_jeu,8,0) | IF(p_ven,16,0) | IF(p_sam,32,0) | IF(p_dim,64,0));
END $$
DELIMITER ;

-- ===================================================================
-- VUE : schedule_days_human (décodage bitmask)
-- ===================================================================
CREATE OR REPLACE VIEW `schedule_days_human` AS
SELECT s.id,
       CONCAT(
         IF(s.days_mask & 1, 'Lun ', ''),
         IF(s.days_mask & 2, 'Mar ', ''),
         IF(s.days_mask & 4, 'Mer ', ''),
         IF(s.days_mask & 8, 'Jeu ', ''),
         IF(s.days_mask & 16,'Ven ', ''),
         IF(s.days_mask & 32,'Sam ', ''),
         IF(s.days_mask & 64,'Dim', '')
       ) AS days_label,
       s.flag_holidays,
       s.flag_sundays,
       s.flag_custom
FROM schedules s;

-- ===================================================================
-- PROCEDURE : set_schedule_stops (remplacement complet des arrêts)
-- ===================================================================
DROP PROCEDURE IF EXISTS set_schedule_stops;
DELIMITER $$
CREATE PROCEDURE set_schedule_stops(IN p_schedule_id INT UNSIGNED, IN p_stops JSON)
BEGIN
  IF p_stops IS NULL OR JSON_TYPE(p_stops) <> 'ARRAY' THEN
    SET p_stops = JSON_ARRAY();
  END IF;
  DELETE FROM schedule_stops WHERE schedule_id = p_schedule_id;
  SET @i = 0;
  WHILE @i < JSON_LENGTH(p_stops) DO
    SET @station_id = JSON_UNQUOTE(JSON_EXTRACT(p_stops, CONCAT('$[',@i,'].station_id')));
    SET @arr = JSON_UNQUOTE(JSON_EXTRACT(p_stops, CONCAT('$[',@i,'].arrival_time')));
    SET @dep = JSON_UNQUOTE(JSON_EXTRACT(p_stops, CONCAT('$[',@i,'].departure_time')));
    INSERT INTO schedule_stops(schedule_id, stop_order, station_id, arrival_time, departure_time)
      VALUES(p_schedule_id, @i, @station_id, IF(@arr='',NULL,@arr), IF(@dep='',NULL,@dep));
    SET @i = @i + 1;
  END WHILE;
  CALL rebuild_schedule_stops_json(p_schedule_id);
END $$
DELIMITER ;

-- ===================================================================
-- PROCEDURE : create_schedule (insertion + arrêts) → crée dans sillons
-- ===================================================================
DROP PROCEDURE IF EXISTS create_schedule;
DELIMITER $$
CREATE PROCEDURE create_schedule(
  IN p_ligne_id INT UNSIGNED,
  IN p_train_number VARCHAR(20),
  IN p_train_type VARCHAR(50),
  IN p_rolling_stock VARCHAR(100),
  IN p_departure_station_id INT UNSIGNED,
  IN p_arrival_station_id INT UNSIGNED,
  IN p_departure_time TIME,
  IN p_arrival_time TIME,
  IN p_days_mask TINYINT UNSIGNED,
  IN p_days_mask_list VARCHAR(32),
  IN p_flag_holidays TINYINT,
  IN p_flag_sundays TINYINT,
  IN p_flag_custom TINYINT,
  IN p_stops JSON
)
BEGIN
  INSERT INTO `sillons`(
    ligne_id, train_number, train_type, rolling_stock,
    departure_station_id, arrival_station_id,
    departure_time, arrival_time,
    days_mask, days_mask_list, flag_holidays, flag_sundays, flag_custom
  ) VALUES (
    p_ligne_id, p_train_number, p_train_type, p_rolling_stock,
    p_departure_station_id, p_arrival_station_id,
    p_departure_time, p_arrival_time,
    p_days_mask, p_days_mask_list, p_flag_holidays, p_flag_sundays, p_flag_custom
  );
  SET @new_id = LAST_INSERT_ID();
  CALL set_schedule_stops(@new_id, p_stops);
  SELECT @new_id AS schedule_id;
END $$
DELIMITER ;

-- ===================================================================
-- PROCEDURE : upsert_daily_variant
-- ===================================================================
DROP PROCEDURE IF EXISTS upsert_daily_variant;
DELIMITER $$
CREATE PROCEDURE upsert_daily_variant(
  IN p_schedule_id INT UNSIGNED,
  IN p_date DATE,
  IN p_type ENUM('retard','suppression','modification'),
  IN p_delay_from_station_id INT UNSIGNED,
  IN p_delay_minutes SMALLINT UNSIGNED,
  IN p_cause TEXT,
  IN p_mod_departure_station_id INT UNSIGNED,
  IN p_mod_arrival_station_id INT UNSIGNED,
  IN p_mod_departure_time TIME,
  IN p_mod_arrival_time TIME,
  IN p_removed_stops JSON,
  IN p_snapshot_original JSON,
  IN p_snapshot_modified JSON
)
BEGIN
  INSERT INTO schedule_daily_variants(
    schedule_id,date,type,delay_from_station_id,delay_minutes,cause,
    mod_departure_station_id,mod_arrival_station_id,mod_departure_time,mod_arrival_time,
    removed_stops,snapshot_original,snapshot_modified
  ) VALUES (
    p_schedule_id,p_date,p_type,p_delay_from_station_id,p_delay_minutes,p_cause,
    p_mod_departure_station_id,p_mod_arrival_station_id,p_mod_departure_time,p_mod_arrival_time,
    p_removed_stops,p_snapshot_original,p_snapshot_modified
  ) ON DUPLICATE KEY UPDATE
    type=VALUES(type),
    delay_from_station_id=VALUES(delay_from_station_id),
    delay_minutes=VALUES(delay_minutes),
    cause=VALUES(cause),
    mod_departure_station_id=VALUES(mod_departure_station_id),
    mod_arrival_station_id=VALUES(mod_arrival_station_id),
    mod_departure_time=VALUES(mod_departure_time),
    mod_arrival_time=VALUES(mod_arrival_time),
    removed_stops=VALUES(removed_stops),
    snapshot_original=VALUES(snapshot_original),
    snapshot_modified=VALUES(snapshot_modified),
    updated_at=CURRENT_TIMESTAMP;
END $$
DELIMITER ;

-- ===================================================================
-- PROCEDURE : rebuild_schedule_stops_json (VERSION CORRIGÉE COMPLÈTE)
-- Génère un JSON avec structure: {"Origine": ..., "Desservies": [...], "Terminus": ...}
-- INCLUT TOUTES LES GARES du tab "Arrêts" dans "Desservies" avec construction manuelle
-- ===================================================================
DROP PROCEDURE IF EXISTS rebuild_schedule_stops_json;
DELIMITER $$
CREATE PROCEDURE rebuild_schedule_stops_json(IN p_schedule_id INT UNSIGNED)
BEGIN
  DECLARE dep_station_name VARCHAR(190);
  DECLARE arr_station_name VARCHAR(190);
  DECLARE dep_time VARCHAR(5);
  DECLARE arr_time VARCHAR(5);
  DECLARE nb_stops INT DEFAULT 0;
  DECLARE done INT DEFAULT FALSE;
  DECLARE stop_station VARCHAR(190);
  DECLARE stop_arrival VARCHAR(5);
  DECLARE stop_departure VARCHAR(5);
  DECLARE stop_dwell INT;
  DECLARE desservies_json TEXT DEFAULT '';

  -- Curseur pour parcourir les arrêts
  DECLARE stops_cursor CURSOR FOR
    SELECT s.name,
           IFNULL(DATE_FORMAT(st.arrival_time,'%H:%i'), NULL),
           IFNULL(DATE_FORMAT(st.departure_time,'%H:%i'), NULL),
           CASE
             WHEN st.arrival_time IS NULL OR st.departure_time IS NULL THEN NULL
             ELSE GREATEST(0, (TIME_TO_SEC(st.departure_time) - TIME_TO_SEC(st.arrival_time)) DIV 60)
           END
    FROM schedule_stops st
    JOIN stations s ON s.id = st.station_id
    WHERE st.schedule_id = p_schedule_id
    ORDER BY st.stop_order;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  -- Récupérer les informations du sillon (gares de départ/arrivée et horaires)
  SELECT ds.name, as2.name, DATE_FORMAT(s.departure_time,'%H:%i'), DATE_FORMAT(s.arrival_time,'%H:%i')
    INTO dep_station_name, arr_station_name, dep_time, arr_time
  FROM sillons s
  JOIN stations ds ON ds.id = s.departure_station_id
  JOIN stations as2 ON as2.id = s.arrival_station_id
  WHERE s.id = p_schedule_id;

  -- Compter le nombre d'arrêts intermédiaires
  SELECT COUNT(*) INTO nb_stops FROM schedule_stops WHERE schedule_id = p_schedule_id;

  IF nb_stops = 0 THEN
    -- Aucun arrêt intermédiaire : trajet direct origine -> terminus
    SET @final_json = JSON_OBJECT(
      'Origine', JSON_OBJECT(
        'arrival_time', NULL,
        'station_name', dep_station_name,
        'dwell_minutes', NULL,
        'departure_time', dep_time
      ),
      'Desservies', JSON_ARRAY(),
      'Terminus', JSON_OBJECT(
        'arrival_time', arr_time,
        'station_name', arr_station_name,
        'dwell_minutes', NULL,
        'departure_time', NULL
      )
    );
    SET @signature = CONCAT('DIRECT:', p_schedule_id);
  ELSE
    -- Construire manuellement le tableau des gares désservies
    SET desservies_json = '[';

    OPEN stops_cursor;

    stops_loop: LOOP
      FETCH stops_cursor INTO stop_station, stop_arrival, stop_departure, stop_dwell;
      IF done THEN
        LEAVE stops_loop;
      END IF;

      -- Ajouter virgule si ce n'est pas le premier élément
      IF desservies_json != '[' THEN
        SET desservies_json = CONCAT(desservies_json, ',');
      END IF;

      -- Construire l'objet JSON pour cette gare avec échappement des guillemets
      SET desservies_json = CONCAT(desservies_json, '{',
        '"arrival_time":', IF(stop_arrival IS NULL, 'null', CONCAT('"', REPLACE(stop_arrival, '"', '\\"'), '"')), ',',
        '"station_name":"', REPLACE(stop_station, '"', '\\"'), '",',
        '"dwell_minutes":', IF(stop_dwell IS NULL, 'null', stop_dwell), ',',
        '"departure_time":', IF(stop_departure IS NULL, 'null', CONCAT('"', REPLACE(stop_departure, '"', '\\"'), '"')),
        '}'
      );
    END LOOP;

    CLOSE stops_cursor;

    SET desservies_json = CONCAT(desservies_json, ']');

    -- Construction du JSON final avec la structure attendue
    SET @final_json = JSON_OBJECT(
      'Origine', JSON_OBJECT(
        'arrival_time', NULL,
        'station_name', dep_station_name,
        'dwell_minutes', NULL,
        'departure_time', dep_time
      ),
      'Desservies', CAST(desservies_json AS JSON),
      'Terminus', JSON_OBJECT(
        'arrival_time', arr_time,
        'station_name', arr_station_name,
        'dwell_minutes', NULL,
        'departure_time', NULL
      )
    );

    -- Génération de la signature pour optimisation
    SELECT CONCAT(
      'FULL:', p_schedule_id, '-',
      GROUP_CONCAT(st.station_id ORDER BY st.stop_order SEPARATOR '-')
    ) INTO @signature
    FROM schedule_stops st
    WHERE st.schedule_id = p_schedule_id;
  END IF;

  -- Mise à jour du sillon avec le JSON complet
  UPDATE `sillons`
    SET stops_json = @final_json,
        stops_signature = @signature,
        updated_at = CURRENT_TIMESTAMP
  WHERE id = p_schedule_id;

END $$
DELIMITER ;

-- ===================================================================
-- TRIGGERS : synchronisation automatique de stops_json
-- ===================================================================
DROP TRIGGER IF EXISTS trg_schedule_stops_ai;
DROP TRIGGER IF EXISTS trg_schedule_stops_au;
DROP TRIGGER IF EXISTS trg_schedule_stops_ad;
DELIMITER $$
CREATE TRIGGER trg_schedule_stops_ai AFTER INSERT ON schedule_stops FOR EACH ROW BEGIN CALL rebuild_schedule_stops_json(NEW.schedule_id); END $$
CREATE TRIGGER trg_schedule_stops_au AFTER UPDATE ON schedule_stops FOR EACH ROW BEGIN CALL rebuild_schedule_stops_json(NEW.schedule_id); END $$
CREATE TRIGGER trg_schedule_stops_ad AFTER DELETE ON schedule_stops FOR EACH ROW BEGIN CALL rebuild_schedule_stops_json(OLD.schedule_id); END $$
DELIMITER ;

-- ===================================================================
-- (OPTIONNEL) Jeu de données d'exemple : décommentez pour tester
-- ===================================================================
-- INSERT INTO stations(name,region) VALUES ('Gare A','Region X'),('Gare B','Region X'),('Gare C','Region Y');
-- CALL create_schedule(NULL,'T123','TER','AGC-01',1,2,'07:30','08:10',63,0,0,0, JSON_ARRAY(
--   JSON_OBJECT('station_id',1,'arrival_time','07:30','departure_time','07:30'),
--   JSON_OBJECT('station_id',3,'arrival_time','07:50','departure_time','07:51'),
--   JSON_OBJECT('station_id',2,'arrival_time','08:10','departure_time','08:10')
-- ));

-- FIN INSTALLATION INITIALE
